/* See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * Esri Inc. licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
define([
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/dom-construct",
  "dojo/i18n!app/nls/resources",
  "esri/request",
  "esri/geometry/Extent",
  "esri/layers/ArcGISDynamicMapServiceLayer",
  "esri/layers/FeatureLayer",
  "esri/layers/ArcGISImageServiceLayer",
  "esri/layers/WMSLayer",
  "esri/geometry/webMercatorUtils",
  "esri/tasks/GeometryService",
  "esri/tasks/ProjectParameters"
],
function (lang, array, domConstruct, i18n,
          esriRequest, Extent,
          ArcGISDynamicMapServiceLayer, FeatureLayer, ArcGISImageServiceLayer, WMSLayer,
          webMercatorUtils, GeometryService, ProjectParameters) {
            
  // declare publicly available geometry server
  var _gs = new GeometryService("https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer");
  
  // universal error handler
  var _handleError = function(map, error) {
    console.error(error);
    domConstruct.create("div",{
      innerHTML: i18n.search.preview.error, 
      class: "g-preview-error"
    }, map.container, "first");
  };
  
  // sets new extent of the map; uses projection if new extent is not compatible with the map
  var _setExtent = function(map, extent) {
    if (!webMercatorUtils.canProject(extent, map)) {
      var params = new ProjectParameters();
      params.geometries = [extent];
      params.outSR = map.spatialReference;
      
      _gs.project(params, function(result) {
        if (result.length > 0) {
          extent = new Extent(result[0]);
          map.setExtent(extent, true);
        }
      }, function(error) {
        console.error(error);
      });
    } else {
      map.setExtent(extent, true);
    }
  };
  
  // layer factories each for each supported service type
  var _layerFactories = {
    
    // map server
    "MapServer": function(map, url) {
      var layer = new ArcGISDynamicMapServiceLayer(url, {});
      layer.on("error", function(error) {
        _handleError(map, error);
      });
      layer.on("load", function(response) {
        if (response && response.layer && response.layer.fullExtent) {
          var extent = new Extent(response.layer.fullExtent);
          _setExtent(map, extent);
        }
      });
      map.addLayer(layer);
    },
    
    // feature server
    "FeatureServer": function(map, url) {
      esriRequest({url: url + "?f=pjson"}).then(function(response){
        if (response) {
          if (response.layers) {
            array.forEach(response.layers, function(layer) {
              if (layer.defaultVisibility) {
                var layer = FeatureLayer(url + "/" + layer.id, {mode: FeatureLayer.MODE_SNAPSHOT});
                layer.on("error", function(error) {
                  _handleError(map, error);
                });
                map.addLayer(layer);
              }
            });
            if (response.fullExtent) {
              var extent = new Extent(response.fullExtent);
              _setExtent(map, extent);
            }
          } else if (url.match(/MapServer\/\d+$/)) {
            var layer = FeatureLayer(url, {mode: FeatureLayer.MODE_SNAPSHOT});
            layer.on("error", function(error) {
              _handleError(map, error);
            });
            map.addLayer(layer);
            if (response.extent) {
              var extent = new Extent(response.extent);
              _setExtent(map, extent);
            }
          }
        }
      }, function(error){
        _handleError(map, error);
      });
    },
    
    // image server
    "ImageServer": function(map, url) {
      var layer = new ArcGISImageServiceLayer(url);
      layer.on("error", function(error) {
        _handleError(map, error);
      });
      layer.on("load", function(response) {
        if (response && response.layer && response.layer.fullExtent) {
          var extent = new Extent(response.layer.fullExtent);
          _setExtent(map, extent);
        }
      });
      map.addLayer(layer);
    },
    
    // WMS server
    "WMS": function(map, url) {
      var layer = new WMSLayer(url);
      layer.on("error", function(error) {
        _handleError(map, error);
      });
      var extentSet = false;
      layer.on("load", function(response) {
        if (response && response.layer) {
          var visibleLayers = lang.clone(layer.visibleLayers);
          var visibleLayersModified = false;
          array.forEach(response.layer.layerInfos, function(lyr) {
            var name = lyr.name;
            if (visibleLayers.indexOf(name) < 0) {
              visibleLayers.push(name);
               visibleLayersModified = true;
            }
            if (visibleLayersModified) {
              layer.setVisibleLayers(visibleLayers);
            }
          });
          if (!extentSet && response.layer.fullExtent) {
            var extent = new Extent(response.layer.fullExtent);
            _setExtent(map, extent);
            extentSet = true;
          }
        }
      });
      map.addLayer(layer);
    }
  };
  
  _getType = function(serviceType) {
    var type = serviceType.type;
    if (type === "MapServer" && serviceType.url.match(/MapServer\/\d+$/)) {
      type = "FeatureServer";
    }
    return type;
  };
  
  // This is an object to be returned as a widget
  var oThisObject = {
    
    // check if service is supported
    canPreview: function(serviceType) {
      var factory = _layerFactories[_getType(serviceType)];
      return !!factory;
    },
    
    // create layer for the service and add it to the map
    addService: function(map, serviceType) {
      var factory = _layerFactories[_getType(serviceType)];
      if (factory) {
        factory(map, serviceType.url);
      }
    }
    
  };
  
  return oThisObject;
});