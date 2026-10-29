/** Observe the original DOM owners. No polling camera or second layout store. */
export function watchNativeNavigationLayout(document:Document,changed:()=>void,cancel:(event:Event)=>void,
  visibility:()=>void) {
  const view=document.defaultView!;
  let frame=0,disposed=false;
  const owners=new Set<Element>(),transitions=new Map<Element,Map<string,number>>();
  const ownLayer=(node:Node|null)=>!!(node instanceof Element?node:node?.parentElement)?.closest('[data-native-navigation-layer]');
  const relevant=(element:Element)=>!ownLayer(element)&&[...owners].some(owner=>owner===element||owner.contains(element)||element.contains(owner));
  const schedule=()=>{if(!disposed&&!frame)frame=view.requestAnimationFrame(tick);};
  const tick=()=>{
    frame=0;if(disposed)return;changed();
    const now=performance.now();
    for(const [element,properties] of transitions){
      for(const [property,until] of properties)if(!element.isConnected||now>until)properties.delete(property);
      if(!properties.size)transitions.delete(element);
    }
    if(transitions.size)schedule();
  };
  const resize=new ResizeObserver(schedule);
  const mutations=new MutationObserver(records=>{if(records.some(record=>!ownLayer(record.target)))schedule();});
  mutations.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,
    attributeFilter:['style','class','hidden','aria-hidden','data-state','open']});
  const transition=(event:Event)=>{
    const value=event as TransitionEvent,element=value.target;
    if(!(element instanceof Element)||!relevant(element))return;
    if(!/^(transform|translate|scale|rotate|width|height|min-width|max-width|min-height|max-height|left|right|top|bottom|opacity|padding.*|margin.*|gap|flex.*|grid.*|font.*|line-height)$/.test(value.propertyName))return;
    if(value.type==='transitionrun'){
      let properties=transitions.get(element);if(!properties)transitions.set(element,properties=new Map());
      // The timeout only releases a lost transitionend; it is not a timer loop
      // for decorative infinite light-wave animations.
      properties.set(value.propertyName,performance.now()+5000);
    }else{transitions.get(element)?.delete(value.propertyName);if(!transitions.get(element)?.size)transitions.delete(element);}
    schedule();
  };
  const interaction=(event:Event)=>{if(event.target instanceof Element&&relevant(event.target))schedule();};
  view.addEventListener('resize',schedule);
  view.addEventListener('wheel',cancel,{capture:true,passive:true});view.addEventListener('pointerdown',cancel,true);
  document.addEventListener('scroll',schedule,true);document.addEventListener('visibilitychange',visibility);
  for(const name of ['pointerover','pointerout','focusin','focusout','animationend','animationcancel'])document.addEventListener(name,interaction,true);
  for(const name of ['transitionrun','transitionend','transitioncancel'])document.addEventListener(name,transition,true);
  return {
    sync(elements:readonly Element[]){
      const next=new Set(elements.filter(element=>element.isConnected));
      for(const element of owners)if(!next.has(element)){resize.unobserve(element);owners.delete(element);transitions.delete(element);}
      for(const element of next)if(!owners.has(element)){owners.add(element);resize.observe(element);}
    },
    dispose(){disposed=true;resize.disconnect();mutations.disconnect();view.cancelAnimationFrame(frame);owners.clear();transitions.clear();
      view.removeEventListener('resize',schedule);view.removeEventListener('wheel',cancel,true);view.removeEventListener('pointerdown',cancel,true);
      document.removeEventListener('scroll',schedule,true);document.removeEventListener('visibilitychange',visibility);
      for(const name of ['pointerover','pointerout','focusin','focusout','animationend','animationcancel'])document.removeEventListener(name,interaction,true);
      for(const name of ['transitionrun','transitionend','transitioncancel'])document.removeEventListener(name,transition,true);
    },
  };
}
