import { SelectableValue } from '@grafana/data';
import { InlineSegmentGroup, Segment, SegmentAsync, useTheme } from '@grafana/ui';
import { cx } from '@emotion/css';
import React, { useCallback } from 'react';
import { useDatasource, useQuery } from '../ElasticsearchQueryContext';
import { useDispatch } from '../../../hooks/useStatelessReducer';
import { getStyles } from './styles';
import { SettingsEditor } from './SettingsEditor';
import { MetricAggregationAction } from './state/types';
import { metricAggregationConfig } from './utils';
import { changeMetricField, changeMetricType } from './state/actions';
import { MetricPicker } from '../../MetricPicker';
import { segmentStyles } from '../styles';
import {
  isMetricAggregationWithField,
  isMetricAggregationWithInlineScript,
  isMetricAggregationWithSettings,
  isPipelineAggregation,
  isPipelineAggregationWithMultipleBucketPaths,
  MetricAggregation,
  MetricAggregationType,
} from './aggregations';
import { useFields } from '../../../hooks/useFields';
import { satisfies } from 'semver';

const toOption = (metric: MetricAggregation) => ({
  label: metricAggregationConfig[metric.type].label,
  value: metric.type,
});

interface Props {
  value: MetricAggregation;
}

// If a metric is a Pipeline Aggregation (https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-pipeline.html)
// it doesn't make sense to show it in the type picker when there is no non-pipeline-aggregation previously selected
// as they work on the outputs produced from other aggregations rather than from documents or fields.
// This means we should filter them out from the type picker if there's no other "basic" aggregation before the current one.
const isBasicAggregation = (metric: MetricAggregation) => !metricAggregationConfig[metric.type].isPipelineAgg;

const getTypeOptions = (
  previousMetrics: MetricAggregation[],
  esVersion: string
): Array<SelectableValue<MetricAggregationType>> => {
  // we'll include Pipeline Aggregations only if at least one previous metric is a "Basic" one
  const includePipelineAggregations = previousMetrics.some(isBasicAggregation);

  return (
    Object.entries(metricAggregationConfig)
      // Only showing metrics type supported by the configured version of ES
      .filter(([_, { versionRange = '*' }]) => satisfies(esVersion, versionRange))
      // Filtering out Pipeline Aggregations if there's no basic metric selected before
      .filter(([_, config]) => includePipelineAggregations || !config.isPipelineAgg)
      .map(([key, { label }]) => ({
        label,
        value: key as MetricAggregationType,
      }))
  );
};

export const MetricEditor = ({ value }: Props) => {
  const styles = getStyles(useTheme(), !!value.hide);
  const datasource = useDatasource();
  const query = useQuery();
  const dispatch = useDispatch<MetricAggregationAction>();
  const getFields = useFields(value.type);

  const loadOptions = useCallback(async () => {
    const remoteFields = await getFields();

    // Metric aggregations that have inline script support don't require a field to be set.
    if (isMetricAggregationWithInlineScript(value)) {
      return [{ label: 'None' }, ...remoteFields];
    }

    return remoteFields;
  }, [getFields, value]);

  const previousMetrics = query.metrics!.slice(
    0,
    query.metrics!.findIndex((m) => m.id === value.id)
  );

  return (
    <>
      <InlineSegmentGroup>
        <Segment
          className={cx(styles.color, segmentStyles)}
          options={getTypeOptions(previousMetrics, datasource.esVersion)}
          onChange={(e) => dispatch(changeMetricType(value.id, e.value! as any))}
          value={toOption(value)}
        />

        {isMetricAggregationWithField(value) && !isPipelineAggregation(value) && (
          <SegmentAsync
            className={cx(styles.color, segmentStyles)}
            loadOptions={loadOptions}
            onChange={(e) => dispatch(changeMetricField(value.id, e.value!))}
            placeholder="Select Field"
            value={value.field}
          />
        )}

        {isPipelineAggregation(value) && !isPipelineAggregationWithMultipleBucketPaths(value) && (
          <MetricPicker
            className={cx(styles.color, segmentStyles)}
            onChange={(e) => dispatch(changeMetricField(value.id, e.value?.id!))}
            options={previousMetrics}
            value={value.field}
          />
        )}
      </InlineSegmentGroup>

      {isMetricAggregationWithSettings(value) && <SettingsEditor metric={value} previousMetrics={previousMetrics} />}
    </>
  );
};
