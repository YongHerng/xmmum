import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./e2e',timeout:45000,use:{baseURL:'http://127.0.0.1:3000',browserName:'chromium',channel:'chrome',screenshot:'only-on-failure',trace:'retain-on-failure'},workers:1,reporter:'list'});
