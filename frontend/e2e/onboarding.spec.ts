import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Snapshot} from '../src/lib/types';

for(const width of [1440,390])test(`new account must upload and confirm a CV, then answer every discovery question at ${width}px`,async({page})=>{
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width,height:1000});
  const bundle=JSON.parse(readFileSync(resolve('src/lib/data/offline-demos.json'),'utf8'));
  const parsed=JSON.parse(readFileSync(resolve('public/examples/aisha-cv.json'),'utf8'));
  const snapshot:Snapshot={...bundle.personas.student.base,profile:{name:'',education:'',category:'',goal:'',location:'',onboarding_complete:false},
    cv:{name:'',email:'',education:'',summary:'',experience:'',projects:'',skills:[],target_role:'',ai_consent:false},
    questionnaire:{category:'',interests:[],strengths:[],career_goal:'',work_style:'',environment:'',motivation:'',social_energy:'',decision_style:'',learning_style:'',weekly_hours:null,budget:null,location:'',relocation:null,completed_step:0},
    evaluation:null,matches:[],pathways:[],completion:0,selected_role:'',demo:false,read_only:false,
    onboarding:{cv_uploaded:false,cv_confirmed:false,discover_complete:false,required_step:'cv'}};
  const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'onboarding@example.invalid',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:new Date().toISOString()};
  const expiresAt=Math.floor(Date.now()/1000)+3600;
  const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=`${encode({alg:'ES256',typ:'JWT'})}.${encode({sub:user.id,exp:expiresAt,aud:'authenticated',role:'authenticated'})}.test-signature`;
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'GET,POST,PUT,OPTIONS'};
  await page.route('**/auth/v1/**',route=>route.fulfill({status:200,headers:cors,json:route.request().url().includes('/user')?user:{access_token:token,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,expires_at:expiresAt,user}}));
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method();let value:unknown={};
    if(method==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    if(path.endsWith('/dashboard'))value=snapshot;
    else if(path.endsWith('/cv/parse')){
      snapshot.cv=parsed.cv;snapshot.profile.name=parsed.cv.name;snapshot.profile.education=parsed.cv.education;
      snapshot.onboarding!.cv_uploaded=true;value=parsed;
    }else if(path.endsWith('/cv')&&method==='PUT'){
      snapshot.cv=request.postDataJSON();snapshot.profile.name=snapshot.cv.name;snapshot.profile.education=snapshot.cv.education;
      snapshot.onboarding!.cv_confirmed=true;snapshot.onboarding!.required_step=snapshot.onboarding!.discover_complete?null:'questionnaire';value={cv:snapshot.cv,version:1};
    }else if(path.endsWith('/profile')&&method==='PUT'){
      snapshot.profile={...snapshot.profile,...request.postDataJSON()};snapshot.cv={...snapshot.cv,name:snapshot.profile.name,education:snapshot.profile.education};value=snapshot.profile;
    }
    else if(path.endsWith('/questionnaire')&&method==='PUT'){
      snapshot.questionnaire=request.postDataJSON();
      snapshot.profile.category=snapshot.questionnaire.category;snapshot.profile.location=snapshot.questionnaire.location;snapshot.profile.goal=snapshot.questionnaire.career_goal||'';
      if(snapshot.questionnaire.completed_step===5){
        if(!snapshot.onboarding!.discover_complete){snapshot.profile.feature_guide_seen=false;snapshot.onboarding!.feature_guide_pending=true;}
        snapshot.profile.onboarding_complete=true;snapshot.onboarding!.discover_complete=true;snapshot.onboarding!.required_step=null;
      }
      value={answers:snapshot.questionnaire};
    }else if(path.endsWith('/onboarding/guide/complete')){
      snapshot.profile.feature_guide_seen=true;snapshot.onboarding!.feature_guide_pending=false;value=snapshot.onboarding;
    }else if(path.includes('/learning/'))value=[];
    await route.fulfill({status:200,headers:cors,json:{data:value,meta:{}}});
  });
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill('test-password-only');
  await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/$/,{timeout:20000});
  await expect(page.getByRole('link',{name:'Open my workspace',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Open my workspace',exact:true}).click();await expect(page).toHaveURL(/\/app\/cv$/,{timeout:20000});
  await expect(page.getByRole('heading',{name:'Upload your CV'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Enter details manually'})).toHaveCount(0);
  if(width<1024)await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('link',{name:'Discover yourself',exact:true})).toHaveAttribute('aria-disabled','true');
  if(width<1024)await page.getByRole('dialog',{name:'Workspace navigation'}).getByRole('button',{name:'Close navigation',exact:true}).click();
  await page.screenshot({path:`test-results/onboarding-upload-${width}.png`,fullPage:true});
  await page.getByRole('checkbox',{name:/Allow AI CV extraction/}).check();
  await page.getByLabel('Upload CV',{exact:true}).setInputFiles(resolve('public/examples/aisha-cv.pdf'));
  await expect(page.getByLabel('Full name')).toHaveValue(parsed.cv.name);
  // Even after uploading, a direct link cannot skip explicit confirmation.
  await page.goto('/app/results');await expect(page).toHaveURL(/\/app\/cv$/,{timeout:20000});
  await page.getByRole('button',{name:'Save & analyse CV'}).click();await expect(page).toHaveURL(/\/app\/questionnaire$/);
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'I’m a student',exact:false}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Technology & AI',exact:true}).click();
  await page.getByLabel('Your strengths').fill('Communication');await page.getByLabel('What would you like your career to involve?').fill('Build useful tools');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Analytical Finding patterns and solving problems'}).click();
  await page.getByRole('button',{name:'Flexible Freedom to shape my approach'}).click();
  await page.getByLabel('When do you feel most energized?').selectOption('mixed');await page.getByLabel('How do you make decisions?').selectOption('both');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Growth & opportunity Learning, progressing, opening doors'}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByLabel('Weekly learning time (hours)')).toHaveValue('');await expect(page.getByLabel('Total learning budget')).toHaveValue('');
  await expect(page.getByRole('button',{name:'Complete my profile'})).toBeDisabled();
  await page.getByLabel('Weekly learning time (hours)').fill('4');await page.getByLabel('Total learning budget').fill('0');await page.getByLabel('Country',{exact:true}).selectOption('Malaysia');
  await page.getByLabel('Are you open to relocating?').selectOption('no');await page.getByLabel('How do you prefer to learn?').selectOption('practice');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/onboarding-discovery-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Complete my profile'}).click();await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page.getByRole('heading',{name:'Your profile is ready. Where next?'})).toBeVisible();
  for(const name of ['Career matches','Learning pathway','SDG impact','Community','News'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/profile-introduction-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Go to my overview'}).click();
  await expect(page.getByRole('heading',{name:/Your future.*Taking shape/})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Start with Discover Yourself'})).toHaveCount(0);
  if(width<1024)await page.getByRole('button',{name:'Open navigation'}).click();
  const mainNavigation=page.getByRole('navigation',{name:'Workspace',exact:true});
  await expect(mainNavigation.getByRole('link',{name:'Career matches',exact:true})).toHaveAttribute('href','/app/results');
  for(const name of ['My profile','Your CV','Discover yourself'])await expect(mainNavigation.getByRole('link',{name,exact:true})).toHaveCount(0);
  if(width<1024)await page.getByRole('dialog',{name:'Workspace navigation'}).getByRole('button',{name:'Close navigation',exact:true}).click();
  await page.reload();await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page.getByRole('region',{name:'Required account setup'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Your profile is ready. Where next?'})).toHaveCount(0);
  const openProfile=async()=>{
    await page.locator('.app-header').getByRole('link',{name:'My profile',exact:true}).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    if(width<1024){
      await expect(page.getByRole('dialog',{name:'Profile navigation'})).toBeVisible();
      await page.getByRole('dialog',{name:'Profile navigation'}).getByRole('button',{name:'Close navigation',exact:true}).click();
    }
  };
  await openProfile();
  const cvInformation=page.getByRole('region',{name:'Your CV information'});
  await cvInformation.getByText('View all CV details',{exact:true}).click();
  await expect(cvInformation.getByText(parsed.cv.education,{exact:true})).toBeVisible();
  const discover=page.getByRole('region',{name:'Discover Yourself'});
  await discover.getByText('View your Discover Yourself answers',{exact:true}).click();
  await expect(discover.getByText('Communication',{exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/profile-integrated-${width}.png`,fullPage:true});
  await discover.getByRole('link',{name:'Review or update your answers'}).click();
  await page.getByRole('button',{name:'Edit my answers'}).click();
  await page.getByLabel('Your name',{exact:true}).fill('Taylor Wong');
  await page.getByRole('textbox',{name:'Education',exact:true}).fill('MSc Software Engineering');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'What draws you in?'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Required account setup'})).toHaveCount(0);
  await openProfile();
  await expect(page.getByRole('heading',{name:'Taylor Wong',exact:true})).toBeVisible();
  await page.getByRole('region',{name:'Your CV information'}).getByText('View all CV details',{exact:true}).click();
  await expect(page.getByRole('region',{name:'Your CV information'}).getByText('MSc Software Engineering',{exact:true})).toBeVisible();
  if(width<1024)await page.getByRole('button',{name:'Open navigation'}).click();
  const profileNavigation=page.getByRole('navigation',{name:'Profile',exact:true});
  await expect(profileNavigation.getByRole('link')).toHaveCount(3);
  await profileNavigation.getByRole('link',{name:'Your CV',exact:true}).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Taylor Wong');
  await page.getByRole('tab',{name:'Education',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Education',exact:true})).toHaveValue('MSc Software Engineering');
  await page.reload();
  if(width<1024)await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('navigation',{name:'Profile',exact:true})).toBeVisible();
  await page.screenshot({path:`test-results/profile-navigation-${width}.png`});
  await page.getByRole('button',{name:'Back to main navigation'}).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page.getByRole('heading',{name:'Your profile is ready. Where next?'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
