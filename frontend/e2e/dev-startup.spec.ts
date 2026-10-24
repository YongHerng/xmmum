import {expect,test} from '@playwright/test';

test('app and demo routes load concurrently without corrupting the development manifest',async({request})=>{
  const paths=['/app/dashboard','/app/profile','/demo/student','/demo/professional'];
  const responses=await Promise.all(paths.map(path=>request.get(path)));
  for(let index=0;index<paths.length;index++){
    expect(responses[index].status(),`${paths[index]} must load without a generated-manifest error`).toBe(200);
  }
});
