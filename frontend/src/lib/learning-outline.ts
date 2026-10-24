type OutlinePosition = {
  scrollTop:number;
  viewportHeight:number;
  groupTop:number;
  groupHeight:number;
  headingHeight:number;
  stepTop?:number;
  stepHeight?:number;
};

/** Reveal the selection with the smallest scroll, allowing room for its sticky heading. */
export function outlineScrollTop(position:OutlinePosition):number {
  const {scrollTop,viewportHeight,groupTop,groupHeight,headingHeight,stepTop,stepHeight=0}=position;
  if(viewportHeight<=0)return scrollTop;
  const gap=8;
  const groupBottom=groupTop+groupHeight;
  let next=scrollTop;
  if(groupHeight<=viewportHeight-gap*2){
    if(groupTop<next+gap)next=groupTop-gap;
    else if(groupBottom>next+viewportHeight-gap)next=groupBottom-viewportHeight+gap;
  }else{
    // The whole chapter cannot fit. Keep its heading pinned while revealing its selected step.
    if(groupTop>next+viewportHeight-headingHeight-gap||groupBottom<=next+headingHeight)
      next=groupTop-gap;
    if(stepTop!==undefined){
      if(stepTop<next+headingHeight+gap)next=stepTop-headingHeight-gap;
      else if(stepTop+stepHeight>next+viewportHeight-gap)next=stepTop+stepHeight-viewportHeight+gap;
    }
  }
  return Math.max(0,next);
}

