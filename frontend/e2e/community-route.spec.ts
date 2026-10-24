import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

test('the standalone community page renders its exported screen and survives refresh',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const bundle=JSON.parse(readFileSync(resolve('src/lib/data/offline-demos.json'),'utf8'));
  await page.route('**/api/v1/demo/student?**',route=>route.fulfill({json:{data:bundle.personas.student.base,meta:{}}}));
  await page.goto('/app/community?demo=student');
  await expect(page.getByRole('heading',{name:'Learn out loud, together.'})).toBeVisible();
  await expect(page.getByText('A glimpse of the community',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Learn out loud, together.'})).toBeVisible();
  expect(errors).toEqual([]);
});
