FROM registry.internal.logz.io:5000/node:14.16.0-alpine3.13 as js-builder

WORKDIR /usr/src/app/

COPY logzio-metrics-ui/package.json logzio-metrics-ui/yarn.lock ./
COPY logzio-metrics-ui/packages packages

RUN apk --no-cache add git
# LOGZ.IO GRAFANA CHANGE :: add -- offline to yarn install
RUN yarn install --pure-lockfile --no-progress

COPY logzio-metrics-ui/tsconfig.json logzio-metrics-ui/.eslintrc logzio-metrics-ui/.editorconfig logzio-metrics-ui/.browserslistrc logzio-metrics-ui/.prettierrc.js ./
COPY logzio-metrics-ui/public public
COPY logzio-metrics-ui/tools tools
COPY logzio-metrics-ui/scripts scripts
COPY logzio-metrics-ui/emails emails

ENV NODE_ENV production
RUN yarn build

FROM registry.internal.logz.io:5000/logzio-golang:1.16.1-alpine3.13 as go-builder

RUN apk add --no-cache gcc g++

WORKDIR $GOPATH/src/github.com/grafana/grafana

COPY logzio-metrics-ui/go.mod logzio-metrics-ui/go.sum logzio-metrics-ui/embed.go ./

RUN go mod verify

COPY logzio-metrics-ui/cue cue
COPY logzio-metrics-ui/public/app/plugins public/app/plugins
COPY logzio-metrics-ui/pkg pkg
COPY logzio-metrics-ui/build.go logzio-metrics-ui/package.json ./

RUN go run build.go build

# Final stage
FROM registry.internal.logz.io:5000/logzio-alpine:3.13

LABEL maintainer="Grafana team <hello@grafana.com>"

ARG GF_UID="472"
ARG GF_GID="0"

ENV PATH="/usr/share/grafana/bin:$PATH" \
    GF_PATHS_CONFIG="/etc/grafana/grafana.ini" \
    GF_PATHS_DATA="/var/lib/grafana" \
    GF_PATHS_HOME="/usr/share/grafana" \
    GF_PATHS_LOGS="/var/log/grafana" \
    GF_PATHS_PLUGINS="/var/lib/grafana/plugins" \
    GF_PATHS_PROVISIONING="/etc/grafana/provisioning"

WORKDIR $GF_PATHS_HOME

RUN apk add --no-cache ca-certificates bash tzdata && \
    apk add --no-cache openssl musl-utils

COPY ./logzio-metrics-ui/conf ./conf

RUN if [ ! $(getent group "$GF_GID") ]; then \
    addgroup -S -g $GF_GID grafana; \
    fi

RUN export GF_GID_NAME=$(getent group $GF_GID | cut -d':' -f1) && \
    mkdir -p "$GF_PATHS_HOME/.aws" && \
    adduser -S -u $GF_UID -G "$GF_GID_NAME" grafana && \
    mkdir -p "$GF_PATHS_PROVISIONING/datasources" \
    "$GF_PATHS_PROVISIONING/dashboards" \
    "$GF_PATHS_PROVISIONING/notifiers" \
    "$GF_PATHS_PROVISIONING/plugins" \
    "$GF_PATHS_PROVISIONING/access-control" \
    "$GF_PATHS_LOGS" \
    "$GF_PATHS_PLUGINS" \
    "$GF_PATHS_DATA" && \
    cp "$GF_PATHS_HOME/conf/sample.ini" "$GF_PATHS_CONFIG" && \
    cp "$GF_PATHS_HOME/conf/ldap.toml" /etc/grafana/ldap.toml && \
    chown -R "grafana:$GF_GID_NAME" "$GF_PATHS_DATA" "$GF_PATHS_HOME/.aws" "$GF_PATHS_LOGS" "$GF_PATHS_PLUGINS" "$GF_PATHS_PROVISIONING" && \
    chmod -R 777 "$GF_PATHS_DATA" "$GF_PATHS_HOME/.aws" "$GF_PATHS_LOGS" "$GF_PATHS_PLUGINS" "$GF_PATHS_PROVISIONING"

COPY --from=go-builder /go/src/github.com/grafana/grafana/bin/*/grafana-server /go/src/github.com/grafana/grafana/bin/*/grafana-cli ./bin/
COPY --from=js-builder /usr/src/app/public ./public
COPY --from=js-builder /usr/src/app/tools ./tools

# LOGZ.IO GRAFANA CHANGE :: Copy custom.ini
COPY custom.ini conf/custom.ini
RUN cp "$GF_PATHS_HOME/conf/custom.ini" "$GF_PATHS_CONFIG"
# LOGZ.IO GRAFANA CHANGE :: Preinstall plugins
COPY ./logzio-metrics-ui/data/plugins "$GF_PATHS_PLUGINS"
# LOGZ.IO GRAFANA CHANGE :: Remove news panel
RUN rm -rf ./public/app/plugins/panel/news
# LOGZ.IO GRAFANA CHANGE :: Remove pluginlist panel
RUN rm -rf ./public/app/plugins/panel/pluginlist

EXPOSE 3000

COPY ./logzio-metrics-ui/packaging/docker/run.sh /run.sh

USER grafana
ENTRYPOINT [ "/run.sh" ]
