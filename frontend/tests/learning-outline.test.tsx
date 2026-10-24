import {describe,expect,it} from 'vitest';
import {outlineScrollTop} from '../src/lib/learning-outline';

describe('classroom outline scroll positioning',()=>{
  it('does not move a chapter that is already visible',()=>{
    expect(outlineScrollTop({scrollTop:0,viewportHeight:350,groupTop:0,groupHeight:250,headingHeight:60,stepTop:70,stepHeight:36})).toBe(0);
  });
  it('does not re-center when changing steps in a visible chapter',()=>{
    for(const stepTop of [370,410,450,490])
      expect(outlineScrollTop({scrollTop:280,viewportHeight:350,groupTop:300,groupHeight:250,headingHeight:60,stepTop,stepHeight:36})).toBe(280);
  });
  it('reveals a later chapter without an unnecessary jump to the center',()=>{
    expect(outlineScrollTop({scrollTop:0,viewportHeight:350,groupTop:700,groupHeight:250,headingHeight:60})).toBe(608);
  });
  it('keeps the first chapter title visible when the window is short',()=>{
    expect(outlineScrollTop({scrollTop:100,viewportHeight:180,groupTop:0,groupHeight:260,headingHeight:60,stepTop:66,stepHeight:36})).toBe(0);
  });
  it('reveals a low step below the pinned chapter title',()=>{
    expect(outlineScrollTop({scrollTop:0,viewportHeight:180,groupTop:0,groupHeight:260,headingHeight:60,stepTop:200,stepHeight:36})).toBe(64);
  });
  it('preserves scroll when a selected step is already visible in a short window',()=>{
    expect(outlineScrollTop({scrollTop:64,viewportHeight:180,groupTop:0,groupHeight:260,headingHeight:60,stepTop:200,stepHeight:36})).toBe(64);
  });
  it('waits until a collapsed mobile list has a visible height',()=>{
    expect(outlineScrollTop({scrollTop:200,viewportHeight:0,groupTop:0,groupHeight:260,headingHeight:60})).toBe(200);
  });
});

