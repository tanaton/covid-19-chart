!function(t){function e(e){for(var a,s,o=e[0],c=e[1],h=e[2],u=0,l=[];u<o.length;u++)s=o[u],Object.prototype.hasOwnProperty.call(n,s)&&n[s]&&l.push(n[s][0]),n[s]=0;for(a in c)Object.prototype.hasOwnProperty.call(c,a)&&(t[a]=c[a]);for(d&&d(e);l.length;)l.shift()();return i.push.apply(i,h||[]),r()}function r(){for(var t,e=0;e<i.length;e++){for(var r=i[e],a=!0,o=1;o<r.length;o++){var c=r[o];0!==n[c]&&(a=!1)}a&&(i.splice(e--,1),t=s(s.s=r[0]))}return t}var a={},n={5:0},i=[];function s(e){if(a[e])return a[e].exports;var r=a[e]={i:e,l:!1,exports:{}};return t[e].call(r.exports,r,r.exports,s),r.l=!0,r.exports}s.m=t,s.c=a,s.d=function(t,e,r){s.o(t,e)||Object.defineProperty(t,e,{enumerable:!0,get:r})},s.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},s.t=function(t,e){if(1&e&&(t=s(t)),8&e)return t;if(4&e&&"object"==typeof t&&t&&t.__esModule)return t;var r=Object.create(null);if(s.r(r),Object.defineProperty(r,"default",{enumerable:!0,value:t}),2&e&&"string"!=typeof t)for(var a in t)s.d(r,a,function(e){return t[e]}.bind(null,a));return r},s.n=function(t){var e=t&&t.__esModule?function(){return t.default}:function(){return t};return s.d(e,"a",e),e},s.o=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},s.p="";var o=window.webpackJsonp=window.webpackJsonp||[],c=o.push.bind(o);o.push=e,o=o.slice();for(var h=0;h<o.length;h++)e(o[h]);var d=c;i.push([88,0]),r()}({0:function(t,e,r){"use strict";r.d(e,"c",(function(){return n})),r.d(e,"d",(function(){return i})),r.d(e,"b",(function(){return s})),r.d(e,"k",(function(){return o})),r.d(e,"s",(function(){return c})),r.d(e,"m",(function(){return h})),r.d(e,"o",(function(){return d})),r.d(e,"n",(function(){return u})),r.d(e,"g",(function(){return l})),r.d(e,"f",(function(){return g})),r.d(e,"e",(function(){return y})),r.d(e,"r",(function(){return f})),r.d(e,"l",(function(){return m})),r.d(e,"h",(function(){return p})),r.d(e,"q",(function(){return v})),r.d(e,"i",(function(){return b})),r.d(e,"j",(function(){return w})),r.d(e,"p",(function(){return x})),r.d(e,"a",(function(){return _}));var a=r(1);const n={confirmed:"confirmed",deaths:"deaths",recovered:"recovered"},i={liner:"liner",log:"log"},s={confirmed:0,deaths:1,recovered:2},o=864e5,c=a.m("%Y%m%d"),h=a.d(",d"),d=a.d(",.3s"),u=a.d(".2f"),l=(new Date(2099,11,31),new Date(2001,0,1),t=>window.btoa(unescape(encodeURIComponent(t)))),g=t=>decodeURIComponent(escape(window.atob(t))),y=t=>parseInt(t,10),f=t=>{if(t.length<8)return new Date(2020,3,1);const e=[t.slice(0,4),t.slice(4,6),t.slice(6)].map(y);return new Date(e[0],e[1]-1,e[2])},m=t=>t.length<8?"2020/04/01":[t.slice(0,4),t.slice(4,6),t.slice(6)].join("/"),p=n.confirmed,v=i.liner,b="Japan",w=c(new Date(Date.now()-2*o)),x=["#ff9500","#f62e36","#b5b5ac","#009bbf","#00bb85","#c1a470","#8f76d6","#00ac9b","#9c5e31","#f39700","#e60012","#9caeb7","#00a7db","#009944","#d7c447","#9b7cb6","#00ada9","#bb641d","#e85298","#0079c2","#6cbb5a","#b6007a","#e5171f","#522886","#0078ba","#019a66","#e44d93","#814721","#a9cc51","#ee7b1a","#00a0de"];class _{constructor(t){var e;this.margin={top:10,right:10,bottom:20,left:60},this.svgid=t;const r=document.getElementById(this.svgid);this.width=null!==(e=null==r?void 0:r.offsetWidth)&&void 0!==e?e:1600,this.height=Math.min(this.width,720)-this.margin.top-this.margin.bottom,this.width=this.width-this.margin.left-this.margin.right,this.svg=a.l("#"+this.svgid).append("svg"),this.svg.attr("width",this.width+this.margin.left+this.margin.right+10).attr("height",this.height+this.margin.top+this.margin.bottom+10)}dispose(){const t=document.getElementById(this.svgid);t&&(t.innerHTML="")}clear(){this.svg.selectAll("g").remove()}createDateRange(t,e){const r=[];let a=new Date(t.getTime());for(;a<=e;)r.push(c(a)),a=new Date(a.getTime()+o);return r}}},2:function(t,e,r){"use strict";r.d(e,"b",(function(){return a})),r.d(e,"a",(function(){return n}));class a{constructor(){this.query=[],this.queryIndex={},this.init()}[Symbol.iterator](){let t=0;const e=this.query;return{next:()=>t<e.length?{done:!1,value:e[t++]}:{done:!0,value:null}}}init(){this.query=[],this.queryIndex={}}set(t,e){void 0===this.queryIndex[t]?(this.queryIndex[t]=this.query.length,this.query.push([t,e])):this.query[this.queryIndex[t]]=[t,e]}get(t){var e;return null!==(e=this.query[this.queryIndex[t]][1])&&void 0!==e?e:""}copy(){const t=new a;for(const[e,r]of this)t.set(e,r);return t}filter(t){const e=new a;for(const[r,a]of this)a!==t.get(r)&&e.set(r,a);return e}loadSearchParams(t){const e=new URLSearchParams(t);for(const[t,r]of e)this.set(t,r)}toString(){const t=new URLSearchParams;for(const[e,r]of this)t.append(e,r);const e=t.toString();return""!==e?"?"+e:""}}class n{constructor(t){this.chart=t,this.query=this.createDefaultQuery(),window.addEventListener("popstate",()=>this.updatePage(),!1)}run(t=""){var e;(e="/data/daily_reports/summary.json",new Promise((t,r)=>{n.get(e,e=>{t(JSON.parse(e.responseText))},t=>{r(t)})})).then(e=>{this.chart.addData(e),this.initQuery(t),this.change()}).catch(t=>{console.error(t)})}dispose(){var t;null===(t=this.chart)||void 0===t||t.dispose()}getQuery(){return this.query.copy()}createQuery(t){return t||(t=this.query),t.filter(this.createDefaultQuery()).toString()}updateQuery(t){const e=this.createQuery(t);e!==location.search?(window.history.pushState("","",location.pathname+e),this.updatePage()):window.history.replaceState("","",location.pathname+e)}updatePage(){const t=this.createQuery();this.loadQuery(location.search);const e=this.createQuery();e!==t?this.change():window.history.replaceState("","",location.pathname+e)}update(t){const e=this.getQuery();for(const[r,a]of t)e.set(r,a);this.updateQuery(e)}static get(t,e,r){const a=new XMLHttpRequest;a.ontimeout=()=>{console.error(`The request for ${t} timed out.`),r("ontimeout")},a.onload=()=>{4===a.readyState&&(200===a.status?e(a):console.error(a.statusText))},a.onerror=()=>{console.error(a.statusText),r("onerror")},a.open("GET",t,!0),a.timeout=5e3,a.send(null)}}},88:function(t,e,r){"use strict";r.r(e);var a=r(1),n=r(3),i=r(4),s=r.n(i),o=r(0),c=r(2);const h=o.d,d="country",u="category",l="yscale",g="startdate",y="enddate",f=[new Date(2099,11,31),new Date(2001,0,1)],m=[0,0];class p extends o.a{constructor(t){super(t),this.vbardata=[],this.barwidth=10,this.vbar_x=a.k().domain(f.concat()).range([0,this.width]),this.vbar_y=a.h().domain(m.concat()).range([this.height,0]),this.vbar_xAxis=a.a(this.vbar_x).tickSizeInner(-this.height).tickFormat(o.s).tickPadding(7).ticks(5),this.vbar_yAxis=a.b(this.vbar_y).tickSizeInner(-this.width).tickFormat(o.m).tickPadding(7).ticks(5),this.vbar_color=a.j(o.p)}changeData(t){if(!this.raw)return;this.vbardata=[];const e=o.b[t],r=this.raw.countrys,a=this.vbar_y.domain(),n=[o.r(b.slider.xaxis.value[0]),o.r(b.slider.xaxis.value[1])];a[1]=m[1];const i=o.f(b.nowcountry);if(r.hasOwnProperty(i)){let t=0;for(const s of r[i].daily){const r=Math.max(s.cdr[e]-t,0);t=s.cdr[e];const i=o.r(s.date);i.getTime()<n[0].getTime()||i.getTime()>n[1].getTime()||(r>a[1]&&(a[1]=r),i.getTime()<n[0].getTime()&&(n[0]=i),i.getTime()>n[1].getTime()&&(n[1]=i),this.vbardata.push({date:i,data:Math.max(r,0)}))}b.confirmed_now=o.m(r[i].cdr[0]),b.deaths_now=o.m(r[i].cdr[1]),b.recovered_now=o.m(r[i].cdr[2])}const s=(n[1].getTime()-n[0].getTime())/o.k+1;this.barwidth=Math.floor(this.width/s),this.vbar_x.domain(n),this.vbar_y.domain(a),this.vbar_y.nice(),b.slider.xaxis.value[0]=o.s(n[0]),b.slider.xaxis.value[1]=o.s(n[1])}addData(t){this.raw=t,b.countrys=[];const e=f.concat(),r=[];for(const a in t.countrys){if(!t.countrys.hasOwnProperty(a))continue;r.push(a);const n=t.countrys[a].daily;if(n&&n.length>0){const t=o.r(n[0].date),r=n[n.length-1],i=o.r(r.date);t.getTime()<e[0].getTime()&&(e[0]=t),i.getTime()>e[1].getTime()&&(e[1]=i);const s=r.cdr;b.countrys.push({id:o.g(a),name:a,data:[s[0],s[1],s[2]],checked:!0})}}this.vbar_color.domain(r),b.slider.xaxis.value=[o.s(e[0]),o.s(e[1])],b.slider.xaxis.data=this.createDateRange(e[0],e[1])}resetScale(t){const e=this.vbar_y.domain();switch(t){case h.liner:this.vbar_y=a.h(),e[0]=0;break;case h.log:this.vbar_y=a.i().clamp(!0),e[0]=1;break;default:}this.vbar_y.range([this.height,0]),this.vbar_y.domain(e),this.vbar_y.nice(),this.vbar_yAxis.scale(this.vbar_y)}draw(){this.vbardata&&(this.vbar=this.svg.selectAll(".vbar").data(this.vbardata).enter().append("g").attr("transform",`translate(${this.margin.left},${this.margin.top})`).attr("class","vbar"),this.vbar.append("rect").style("fill",this.vbar_color(o.f(b.nowcountry))).attr("x",t=>this.vbar_x(t.date)-this.barwidth/2).attr("y",t=>this.vbar_y(t.data)).attr("width",this.barwidth).attr("height",t=>Math.abs(this.vbar_y(0)-this.vbar_y(t.data))),this.vbar.append("title").text(t=>`date:${o.s(t.date)}\ndata:${o.m(t.data)}`),this.svg.append("g").attr("class","x axis").attr("transform",`translate(${this.margin.left},${this.height+this.margin.top})`).call(this.vbar_xAxis),this.svg.append("g").attr("class","y axis").attr("transform",`translate(${this.margin.left},${this.margin.top})`).call(this.vbar_yAxis))}}class v extends c.a{constructor(t=""){super(new p("svgvbar")),this.startdate="20200401",this.enddate="20200410",this.run(t)}createDefaultQuery(){const t=new c.b;return t.set(d,o.i),t.set(u,o.h),t.set(l,o.q),t.set(g,this.startdate),t.set(y,this.enddate),t}loadQuery(t){t||(t=location.search),this.query=this.createDefaultQuery(),this.query.loadSearchParams(t),b.nowcountry=o.g(this.query.get(d)),b.nowcategory=this.query.get(u),b.nowyscale=this.query.get(l),b.slider.xaxis.value=[this.query.get(g),this.query.get(y)]}initQuery(t=""){const e=b.slider.xaxis.data;e.length>=2&&(this.startdate=e[0],this.enddate=e[e.length-1]),this.loadQuery(t),this.updateQuery()}change(){this.chart.clear(),this.chart.resetScale(b.nowyscale),this.chart.changeData(b.nowcategory),this.chart.draw()}}const b={confirmed_now:"",deaths_now:"",recovered_now:"",categorys:[{id:o.c.confirmed,name:"感染数"},{id:o.c.deaths,name:"死亡数"},{id:o.c.recovered,name:"回復数"}],yscales:[{id:h.liner,name:"線形"},{id:h.log,name:"対数"}],countrys:[],slider:{xaxis:{value:[o.j,o.j],data:[o.j]}},nowcategory:o.h,nowyscale:o.q,nowcountry:o.g(o.i)},w=(new n.default({el:"#container",data:b,components:{VueSlider:s.a},computed:{nowcountrystr:()=>o.f(b.nowcountry),startdate:()=>o.l(b.slider.xaxis.value[0]),enddate:()=>o.l(b.slider.xaxis.value[1]),lastdate:()=>o.l(b.slider.xaxis.data[b.slider.xaxis.data.length-1])},methods:{categoryChange:()=>w.update([[u,b.nowcategory]]),yscaleChange:()=>w.update([[l,b.nowyscale]]),countryChange:()=>w.update([[d,o.f(b.nowcountry)]]),sliderChange:()=>w.update([[g,b.slider.xaxis.value[0]],[y,b.slider.xaxis.value[1]]])}}),new v(location.search))}});
//# sourceMappingURL=vertical_bar.js.map