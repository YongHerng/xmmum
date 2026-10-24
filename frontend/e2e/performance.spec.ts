import {test,expect} from '@playwright/test';
import {signInForTest} from './auth-helpers';
test.beforeEach(async({page})=>{await signInForTest(page)});

test('warm workspace navigation preserves the shell and does not reload snapshots',async({page})=>{
  const reads:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/v1/demo/'))reads.push(request.url())});
  await page.goto('/demo/student');
  await expect(page.locator('.future-hero h2')).toContainText('Aisha');
  // React development Strict Mode can abort/restart the initial read. Only
  // navigation-triggered reads are a regression; production does not replay it.
  const initialReads=reads.length;
  await page.locator('.workspace').evaluate(el=>el.setAttribute('data-shell-proof','original'));
  const timing:Record<string,number>={};
  for(const [label,url] of [['Your CV','/app/cv'],['Career matches','/app/results'],['Learning pathway','/app/pathway'],['Overview','/app/dashboard']]){
    const start=Date.now();
    await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('link',{name:label,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(url));
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('.workspace')).toHaveAttribute('data-shell-proof','original');
    await expect(page.getByRole('region',{name:'Loading workspace'})).toHaveCount(0);
    timing[label]=Date.now()-start;
  }
  expect(reads).toHaveLength(initialReads);
  console.log('Warm local demo navigation (ms):',JSON.stringify(timing));
});

test('slow scenario updates keep content visible, preserve selection, and recover from errors',async({page})=>{
  await page.goto('/app/results?demo=student');
  await expect(page.locator('.career-card')).toHaveCount(5);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve});
  await page.route('**/api/v1/demo/*?*scenario=rapid*',async route=>{await gate;await route.continue()});
  await page.getByRole('button',{name:'Rapid adoption',exact:true}).click();
  await expect(page.locator('.workspace-sync')).toContainText('Updating workspace');
  await expect(page.locator('.career-card')).toHaveCount(5);
  await expect(page.getByRole('region',{name:'Loading workspace'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Moderate adoption',exact:true})).toHaveAttribute('aria-pressed','true');
  release();
  await expect(page.getByRole('button',{name:'Rapid adoption',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('link',{name:'Overview',exact:true}).click();
  await expect(page.locator('.future-hero h2')).toContainText('Aisha');
  await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('link',{name:'Career matches',exact:true}).click();
  await expect(page.getByRole('button',{name:'Rapid adoption',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.route('**/api/v1/demo/**',route=>route.fulfill({status:503,contentType:'application/problem+json',body:JSON.stringify({detail:'Temporary test outage.'})}));
  await page.getByRole('button',{name:'Refresh workspace',exact:true}).click();
  await expect(page.locator('.workspace-sync').getByRole('alert')).toContainText('Showing the last loaded version');
  await expect(page.locator('.career-card')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'Retry update'})).toBeVisible();
});

test('another demo persona never sees the previous persona while loading',async({page})=>{
  await page.goto('/demo/student');await expect(page.locator('.future-hero h2')).toContainText('Aisha');
  await page.goto('/');
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve});
  await page.route('**/api/v1/demo/professional**',async route=>{await gate;await route.continue()});
  await page.getByRole('link',{name:/Meet Daniel/}).click();
  await expect(page.getByRole('region',{name:'Loading workspace'})).toBeVisible();
  await expect(page.getByText('Aisha Rahman',{exact:true})).toHaveCount(0);
  release();await expect(page.locator('.future-hero h2')).toContainText('Daniel');
});

test('sections slide back in from both scroll directions without hiding focused content',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.goto('/');
  const reveal=page.locator('#how-it-works [data-reveal]').first();
  await expect(reveal).toHaveAttribute('data-reveal-state','below');
  await reveal.scrollIntoViewIfNeeded();await expect(reveal).toHaveAttribute('data-reveal-state','visible');
  await expect.poll(()=>reveal.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  await page.locator('#questions').scrollIntoViewIfNeeded();await expect(reveal).toHaveAttribute('data-reveal-state','above');
  await reveal.scrollIntoViewIfNeeded();await expect(reveal).toHaveAttribute('data-reveal-state','visible');
  await expect.poll(()=>reveal.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  await page.screenshot({path:'test-results/performance-scroll-reveal.png',animations:'disabled'});
  const interactive=page.locator('#platform [data-reveal]').filter({has:page.getByRole('link',{name:'Explore career intelligence'})});
  await interactive.getByRole('link').focus();
  await expect.poll(()=>interactive.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  await page.locator('#questions').scrollIntoViewIfNeeded();
  await expect(interactive.getByRole('link')).toBeFocused();
  await expect(interactive).toHaveCSS('opacity','1');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>reveal.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await expect(reveal).toHaveCSS('opacity','1');
});

test('the dashboard does not download chart or graph implementation bundles',async({page})=>{
  const chunks:string[]=[];
  page.on('request',r=>{if(r.url().includes('/_next/static/chunks/'))chunks.push(r.url())});
  await page.goto('/demo/student');await expect(page.locator('.future-hero h2')).toContainText('Aisha');
  expect(chunks.filter(url=>/skill-coverage-chart|impact-graph/.test(url))).toEqual([]);
});
