



<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<div class="eldara-map-wrap">
<div id="leaflet-map-andurin" style="height:800px;width:100%;border:1px solid var(--gray);border-radius:4px;"></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
(function(){
  function initMap(){
    var el=document.getElementById('leaflet-map-andurin');
    if(!el||el._lInit)return;
    el._lInit=true;
    var bounds=[[0,0],[1024,1536]];
    var m=L.map('leaflet-map-andurin',{crs:L.CRS.Simple,minZoom:-2,maxZoom:4});
    L.imageOverlay('/Pics/andurinmap.png',bounds).addTo(m);
    m.fitBounds(bounds);
    m.setZoom(-1);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initMap);
  } else { initMap(); }
  document.addEventListener('nav',function(){
    var el=document.getElementById('leaflet-map-andurin');
    if(el)el._lInit=false;
    initMap();
  });
})();
</script>




