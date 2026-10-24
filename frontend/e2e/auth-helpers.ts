import {test,type Page,expect} from '@playwright/test';

// Protected journeys now require an explicitly configured dedicated test account.
// Without it, they remain skipped rather than creating or modifying an account.
export async function signInForTest(page:Page) {
  test.skip(!process.env.E2E_EMAIL||!process.env.E2E_PASSWORD,'Set dedicated E2E_EMAIL/E2E_PASSWORD for login-first journeys.');
  await page.goto('/auth/login');
  await page.getByLabel('Email address').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link',{name:'Open my workspace',exact:true})).toBeVisible();
}
