import {afterEach,expect,it} from 'vitest';

import {readRailwayPresentationPreference,saveRailwayPresentationPreference} from './railwayPresentationPreferences';

afterEach(()=>localStorage.clear());
it('stores only disposable column/visibility preferences per project, without changing the entity identity',()=>{
  saveRailwayPresentationPreference('p',{columns:2,hiddenKeys:['existing-scope-key']});
  expect(readRailwayPresentationPreference('p')).toEqual({columns:2,hiddenKeys:['existing-scope-key']});
  expect(readRailwayPresentationPreference('other')).toEqual({columns:'auto',hiddenKeys:[]});
  const record=JSON.parse(localStorage.getItem('lcos-railway-ui:p')??'{}') as Record<string,unknown>;
  expect(Object.keys(record)).toEqual(['columns','hiddenKeys']);
});
it('invalid disposable preferences do not block project navigation',()=>{
  localStorage.setItem('lcos-railway-ui:p','broken json');
  expect(readRailwayPresentationPreference('p')).toEqual({columns:'auto',hiddenKeys:[]});
});
