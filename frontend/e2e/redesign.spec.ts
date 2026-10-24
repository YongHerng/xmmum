import { test,expect } from '@playwright/test';
import {signInForTest} from './auth-helpers';
test.beforeEach(async({page})=>{await signInForTest(page)});

const routes=[
  ['landing','/'],['login','/auth/login'],['register','/auth/register'],
  ['student','/demo/student'],['professional','/demo/professional'],
  ['questionnaire','/app/questionnaire?demo=student'],['cv','/app/cv?demo=student'],
  ['results','/app/results?demo=student'],['pathway','/app/pathway?demo=student'],['sdg','/app/sdg?demo=student'],
] as const;

for(const width of [390,768,1024,1440]){
  test(`all redesigned routes fit at ${width}px`,async({page})=>{
    test.setTimeout(180000);
    await page.setViewportSize({width,height:900});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    for(const [name,url] of routes){
      await page.goto(url);
      if(url.includes('demo'))await expect(page.locator('.demo-banner')).toContainText('Read-only');
      await expect(page.locator('main h1:visible, main h2:visible').first()).toBeVisible();
      if(url.includes('demo'))await expect(page.locator('main h1')).toBeVisible();
      if(name==='results')await expect(page.getByRole('heading',{name:'Career matches, illustrated.'})).toBeVisible();
      if(name==='sdg')await expect(page.locator('.react-flow__viewport')).toBeVisible();
      const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:window.innerWidth}));
      expect(overflow.page,`${name} has horizontal overflow at ${width}`).toBeLessThanOrEqual(overflow.viewport);
      // Ignore the static, intentionally layered product artwork; real controls must fit.
      for(const control of await page.locator('main .btn:visible,main input:visible,main textarea:visible,main select:visible').all()){
        const box=await control.boundingBox();if(box){expect(box.x,`${name} control starts outside viewport`).toBeGreaterThanOrEqual(-1);expect(box.x+box.width,`${name} control clipped`).toBeLessThanOrEqual(width+1)}
      }
      if(width===390||width===1440){await page.screenshot({path:`test-results/redesign-${name}-${width}.png`,fullPage:true,animations:'disabled'});await page.screenshot({path:`test-results/redesign-${name}-${width}-viewport.png`,animations:'disabled'})}
    }
    expect(errors).toEqual([]);
  });
}

test('public navigation traps focus, closes with Escape, and opens demos',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const trigger=page.getByRole('button',{name:'Open menu'});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Main navigation'});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Log out',exact:true}).focus();await page.keyboard.press('Tab');
  await expect(dialog.getByRole('link',{name:'Pravista home'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
  await trigger.click();await dialog.getByRole('link',{name:'Explore demos'}).click();await expect(dialog).not.toBeVisible();
  await page.getByRole('link',{name:/Meet Daniel/}).click();await expect(page.locator('.demo-banner')).toContainText('Daniel');
});

test('public preview is independent of API availability and FAQs work',async({page})=>{
  const calls:string[]=[];await page.route('**/api/v1/**',async route=>{calls.push(route.request().url());await route.abort()});
  await page.goto('/');await expect(page.getByRole('img',{name:'Score 82 out of 100'})).toBeVisible();
  await page.getByText('Does it work without an AI key?',{exact:true}).click();await expect(page.getByText(/AI extraction, CV assessments, writing suggestions, and live vacancy analysis require an available configured provider/)).toBeVisible();
  expect(calls).toEqual([]);
});

test('workspace drawer traps focus and read-only CV retains its privacy labels',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/demo/student');await expect(page.locator('main h1')).toBeVisible();
  const trigger=page.getByRole('button',{name:'Open navigation'});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Workspace navigation'});await expect(dialog).toBeVisible();
  await dialog.getByRole('link',{name:'How it works',exact:true}).focus();await page.keyboard.press('Tab');
  await expect(dialog.getByRole('link',{name:'Pravista home'})).toBeFocused();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
  await page.getByRole('link',{name:'My profile',exact:true}).click();await page.getByRole('navigation',{name:'Profile',exact:true}).getByRole('link',{name:'Your CV',exact:true}).click();await expect(page.getByLabel('Full name')).toBeDisabled();await page.getByRole('tab',{name:'Languages',exact:true}).click();await expect(page.getByLabel('Languages content')).toBeDisabled();await expect(page.getByText('Original files are discarded after reading.',{exact:false})).toBeVisible();
});

test('reduced motion keeps the hero and product preview fully visible and static',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.getByRole('heading',{name:/Your future\. Full of possibility/})).toBeVisible();
  const preview=page.locator('[aria-label="Fictional career dashboard preview"]');await preview.scrollIntoViewIfNeeded();
  expect(await preview.evaluate(el=>getComputedStyle(el.parentElement!).transform)).toBe('none');
  expect(await page.locator('html').evaluate(el=>getComputedStyle(el).scrollBehavior)).toBe('auto');
});

test('backup demos remain usable when every backend request fails',async({page})=>{
  const calls:string[]=[];
  await page.route('**/api/v1/**',async route=>{calls.push(route.request().url());await route.abort();});
  await page.goto('/app/results?demo=student');
  await expect(page.getByRole('heading',{name:'Career matches, illustrated.'})).toBeVisible();
  await expect(page.getByText('3 fictional vacancy examples')).toBeVisible();
  await page.getByRole('tab',{name:'Future roles & outlook'}).click();
  await page.getByLabel('Forecast horizon').selectOption('15');
  await expect(page.getByText('YOUR 15-YEAR DEVELOPMENT MAP')).toBeVisible();
  await page.goto('/app/cv?demo=professional&tab=improve');
  await expect(page.getByRole('heading',{name:'A clearer CV, illustrated.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Download example CV PDF'})).toHaveAttribute('href','/demos/professional-improved-cv.pdf');
  await page.goto('/app/pathway?view=catalogue&demo=professional');
  await expect(page.getByRole('heading',{name:'Data Center Fundamentals'})).toBeVisible();
  expect(calls).toEqual([]);
});
