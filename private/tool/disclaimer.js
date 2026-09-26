document.getElementById('disclaimer-agree').addEventListener('click',()=>{
 const gate=document.getElementById('disclaimer-gate'),tool=document.getElementById('tool-content');
 tool.hidden=false;tool.removeAttribute('inert');gate.hidden=true;
 window.scrollTo(0,0);
 const heading=tool.querySelector('h1');
 if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
});
