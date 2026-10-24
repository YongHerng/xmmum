import { test,expect } from '@playwright/test';
test('read-only student journey and scenario comparison',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const writes:string[]=[];page.on('request',r=>{if(r.url().includes(':8000')&&r.method()!=='GET')writes.push(r.url())});
 await page.setViewportSize({width:1440,height:1100});await page.goto('/demo/student');await expect(page.getByRole('heading',{name:/Your future\. Taking shape/})).toBeVisible();await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'Career matches'}).click();await expect(page.getByRole('heading',{name:'Your career possibilities'})).toBeVisible();
 await expect(page.locator('.career-card')).toHaveCount(5);await page.getByRole('button',{name:'Rapid adoption'}).click();
 await expect(page.getByRole('button',{name:'Rapid adoption'})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.career-card').first()).toBeVisible();await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();await page.screenshot({path:'test-results/careers-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('tab',{name:'Skill outlook'}).click();await expect(page.getByText('Prototype scenario estimate', {exact:false}).first()).toBeVisible();
 await page.getByRole('link',{name:'Learning pathway',exact:true}).click();await expect(page.getByRole('button',{name:/Lowest-Cost Transition/})).toBeVisible();
 await page.getByRole('button',{name:/Lowest-Cost Transition/}).click();
 await page.getByRole('link',{name:'SDG impact'}).click();await expect(page.getByRole('heading',{name:'See the connection'})).toBeVisible();
 expect(writes).toEqual([]);
 expect(errors).toEqual([]);
});
test('login-first entry and account validation',async({page})=>{
 await page.goto('/');await expect(page).toHaveURL(/auth\/login/);
 await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
 await page.getByRole('link',{name:'Create an account',exact:true}).click();
 await page.getByLabel('Email address').fill('test@example.invalid');await page.getByLabel('Password',{exact:true}).fill('short');await page.getByRole('button',{name:'Create my account'}).click();await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
});

test('professional demo and mobile navigation',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/demo/professional');await expect(page.getByRole('heading',{name:/Daniel/})).toBeVisible();
 await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('link',{name:'Your CV',exact:true}).click();await expect(page.getByRole('heading',{name:'Upload your CV'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test('authenticated live account journey (optional)',async({page})=>{
 test.skip(!process.env.E2E_EMAIL||!process.env.E2E_PASSWORD,'Set E2E_EMAIL and E2E_PASSWORD to a confirmed Supabase test user.');
 await page.goto('/auth/login');await page.getByLabel('Email address').fill(process.env.E2E_EMAIL!);await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/$/);await page.getByRole('link',{name:'Open my workspace',exact:true}).click();await expect(page).toHaveURL(/app\/dashboard/);
 await page.getByRole('link',{name:'Discover yourself',exact:true}).click();for(let i=0;i<4;i++){const button=page.getByRole('button',{name:'Continue',exact:true});if(await button.isVisible())await button.click()};await page.getByRole('button',{name:'Continue to my CV'}).click();await expect(page.getByRole('heading',{name:'Upload your CV'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Upload your CV'})).toBeVisible();
});
