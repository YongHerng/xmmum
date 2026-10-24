import {expect,test} from '@playwright/test';

test('fresh-clone demo works without a Supabase login and opens the CV sample',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/demo/student');
  await expect(page.locator('.demo-banner')).toContainText('Read-only');
  await expect(page.locator('main h1')).toBeVisible();
  await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('link',{name:'Your CV',exact:true}).click();
  await expect(page).toHaveURL(/app\/cv\?demo=student/);
  await page.getByRole('button',{name:/No CV handy/}).click();
  await page.getByRole('button',{name:'Reviewed',exact:true}).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Aisha Rahman');
  await expect(page.getByText('Ready for your next step',{exact:true})).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button',{name:'Explore analysis'})).toBeEnabled();
  expect(errors).toEqual([]);
});

test('personal workspace still requires authentication',async({page})=>{
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL(/auth\/login/);
  await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
});
