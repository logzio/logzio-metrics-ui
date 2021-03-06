import React from 'react';
import { find } from 'lodash';
import { SignIn } from './SignIn';
import BottomNavLinks from './BottomNavLinks';
import { contextSrv } from 'app/core/services/context_srv';
// import config from '../../config';
import { NavModelItem } from '@grafana/data';

export default function BottomSection() {
  // const navTree: NavModelItem[] = cloneDeep(config.bootData.navTree);
  // LOGZ.IO GRAFANA CHANGE :: filter out everything from bottom menu for now
  const bottomNav: NavModelItem[] = [];
  const isSignedIn = contextSrv.isSignedIn;
  const user = contextSrv.user;

  if (user && user.orgCount > 1) {
    const profileNode: any = find(bottomNav, { id: 'profile' });
    if (profileNode) {
      profileNode.showOrgSwitcher = true;
    }
  }

  return (
    <div className="sidemenu__bottom">
      {!isSignedIn && <SignIn />}
      {bottomNav.map((link, index) => {
        return <BottomNavLinks link={link} user={user} key={`${link.url}-${index}`} />;
      })}
    </div>
  );
}
