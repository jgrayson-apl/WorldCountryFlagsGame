/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/number",
  "dojo/date/locale",
  "dojo/aspect",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "dojo/dnd/Source",
  "dojo/dnd/Target",
  "esri/identity/IdentityManager",
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/GraphicsLayer",
  "esri/geometry/Extent",
  "esri/Graphic",
  "esri/widgets/Feature",
  "esri/widgets/FeatureForm",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/ScaleBar",
  "esri/widgets/Compass",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand",
  "Application/CountryFlagsGame"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             number, locale, aspect, on, query, dom, domClass, domConstruct, Source, Target,
             IdentityManager, Accessor, Evented, watchUtils, promiseUtils, Portal, Layer, GraphicsLayer, Extent,
             Graphic, Feature, FeatureForm, Home, Search, LayerList, Legend, ScaleBar, Compass, BasemapGallery, Expand,
             CountryFlagsGame) {


  const throttle = (func, limit) => {
    let lastFunc;
    let lastRan;
    return function () {
      const context = this;
      const args = arguments;
      if(!lastRan) {
        func.apply(context, args);
        lastRan = Date.now()
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(function () {
          if((Date.now() - lastRan) >= limit) {
            func.apply(context, args);
            lastRan = Date.now()
          }
        }, limit - (Date.now() - lastRan))
      }
    }
  };

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      this.CSS = {
        loading: "configurable-application--loading",
        NOTIFICATION_TYPE: {
          MESSAGE: "alert alert-blue animate-in-up is-active inline-block",
          SUCCESS: "alert alert-green animate-in-up is-active inline-block",
          WARNING: "alert alert-yellow animate-in-up is-active inline-block",
          ERROR: "alert alert-red animate-in-up is-active inline-block"
        },
      };
      this.base = null;

      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if(!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function (response) {
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem) {
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";
      viewProperties.highlightOptions = {
        color: "#0079c1",
        haloOpacity: 0.5,
        fillOpacity: 0.1
      };
      viewProperties.constraints = { snapToZoom: false };
      viewProperties.zoom = 2.25;

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          domClass.remove(document.body, this.CSS.loading);
          view.when(() => {
            this.viewReady(config, firstItem, view).then(() => {
              /*...*/
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // LOADING //
      const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });

      // USER SIGN IN //
      return this.initializeUserSignIn(view).always(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        // SEARCH //
        const search = new Search({ view: view, searchTerm: this.base.config.search || "" });
        const searchExpand = new Expand({
          view: view,
          content: search,
          expandIconClass: "esri-icon-search",
          expandTooltip: "Search"
        });
        view.ui.add(searchExpand, { position: "top-left", index: 0 });

        // BASEMAPS //
        /* const basemapGalleryExpand = new Expand({
           view: view,
           content: new BasemapGallery({ view: view }),
           expandIconClass: "esri-icon-basemap",
           expandTooltip: "Basemap"
         });
         view.ui.add(basemapGalleryExpand, { position: "top-left", index: 1 });*/

        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 1 });


        // FLAGS //
        return this.initializeFlags(view);

      });

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function (view) {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user) {
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode) {
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     * @param layer_title
     * @returns {*}
     */
    whenLayerReady: function (view, layer_title) {

      const layer = view.map.layers.find(layer => {
        return (layer.title === layer_title);
      });
      if(layer) {
        return layer.load().then(() => {
          if(layer.visible) {
            return view.whenLayerView(layer).then((layerView) => {
              if(layerView.updating) {
                return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                  return { layer: layer, layerView: layerView };
                });
              } else {
                return watchUtils.whenOnce(layerView, "updating").then(() => {
                  return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                    return { layer: layer, layerView: layerView };
                  });
                });
              }
            });
          } else {
            return promiseUtils.resolve({ layer: layer, layerView: null });
          }
        });
      } else {
        return promiseUtils.reject(new Error(`Can't find layer '${layer_title}'`));
      }

    },

    /**
     *
     * @param view
     */
    initializeFlags: function (view) {

      // COUNTRY FLAG OVERLAY LAYER //
      const correct_layer = new GraphicsLayer({ opacity: 0.8 });
      view.map.layers.add(correct_layer);

      // ADD COUNTRY FLAG FEATURE //
      const createFlagGraphic = (country_geom, country_name) => {
        correct_layer.add({
          geometry: country_geom,
          symbol: {
            type: "picture-fill",
            url: `https://apl.esri.com/legends/Flags/${country_name}.jpg`,
            width: "160px",
            height: "80px"/*,
            outline: {
              type: "simple-line",
              style: "solid",
              color: "#0079c1",
              width: 2.0
            }*/
          }
        });
      };
      const clearFlagGraphics = () => {
        correct_layer.removeAll();
      };

      // TOGGLE COUNTRY FLAG OVERLAY //
      const correctLayerPanel = dom.byId("correct-layer-panel");
      view.ui.add(correctLayerPanel, "top-right");
      domClass.remove(correctLayerPanel, "hide");
      const flagOverlayInput = dom.byId("flag-overlay-input");
      on(flagOverlayInput, "change", () => {
        correct_layer.visible = flagOverlayInput.checked;
      });

      // FLAGS PANEL //
      const flags_panel = dom.byId("flags-panel");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(flags_panel, "panel-disabled", updating);
      });


      // FIND COUNTRY FIND LAYER AND MAKE SURE THE LAYERVIEW IS READY //
      return this.whenLayerReady(view, "World Country Flags").then(layer_info => {
        const countries_layer = layer_info.layer;
        const countries_layerView = layer_info.layerView;

        // HIGHLIGHT //
        let highlight;
        this.clearHighlight = () => {
          highlight && highlight.remove();
        };
        const highlightCountry = (screen_point) => {
          return view.hitTest(screen_point).then(hitTestResponse => {
            this.clearHighlight();

            //console.info("highlightCountry: ", hitTestResponse.results.length);
            // if length === 3 you are dragging over a country that already has a flag...

            const hit_count = hitTestResponse.results.length;
            if(hit_count < 3) {
              const country_hit = hitTestResponse.results.find(result => {
                return (result.graphic && result.graphic.layer && (result.graphic.layer.id === countries_layer.id));
              });
              if(country_hit) {
                highlight = countries_layerView.highlight(country_hit.graphic);
              }
              view.container.style.cursor = "default";
            } else {
              view.container.style.cursor = "not-allowed";
            }
          });
        };

        //
        // CURRENT FLAGS GAME //
        //
        const flags_game = new CountryFlagsGame({
          container: "game-panel",
          user: this.base.portal.user,
          source: countries_layer
        });
        // GAME THEME //
        watchUtils.whenDefined(flags_game, "themeFields", themeFields => {
          const theme_select = dom.byId("theme-select");
          themeFields.forEach(themeField => {
            domConstruct.create("option", { value: themeField.name, innerHTML: themeField.alias }, theme_select);
          });
          on(theme_select, "change", () => {
            flags_game.theme = theme_select.value;
            resetGame();
          });
        });

        // SAVE GAME //
        const save_game_link = dom.byId("save-game-link");
        const social_links = dom.byId("social_links");
        watchUtils.init(flags_game, "canSave", canSave => {
          domClass.toggle(save_game_link, "btn-disabled", !canSave);
        });
        on(save_game_link, "click", () => {
          calcite.bus.emit("modal:open", { id: "save-score-dialog" });
          flags_game.save().then(() => {
            const share_title = `I achieved a Top 10 score of ${flags_game.score} in 'The World Country Flags Game'! #esricountryflagsgame`;
            addthis.update("share", "title", share_title);
            domClass.add("saving-label", "hide");
            domClass.remove("sharing-node", "hide");
            resetGame();
          });
        });

        // SCOREBOARD READY //
        const scoreboard_link = dom.byId("scoreboard-link");
        flags_game.on("scoreboard-ready", () => {
          domClass.remove(scoreboard_link, "btn-disabled");
        });

        // DISPLAY SCORES TABLE //
        const displayScores = (top_scores, parent_node) => {
          domConstruct.empty(parent_node);

          top_scores.forEach((top_10_score, rank) => {
            const score_row = domConstruct.create("tr", {}, parent_node);

            domConstruct.create("td", {
              className: `field-center avenir-demi`,
              innerHTML: (rank + 1)
            }, score_row);

            domConstruct.create("td", {
              className: `field-left field-user`,
              innerHTML: `${top_10_score.attributes.fullname}`
            }, score_row);

            domConstruct.create("td", {
              className: `field-center font-size-1 text-blue`,
              innerHTML: `${top_10_score.attributes.score}`
            }, score_row);

            domConstruct.create("td", {
              className: `field-left field-theme`,
              innerHTML: `${top_10_score.attributes.theme}`
            }, score_row);

            domConstruct.create("td", {
              className: `field-right`,
              innerHTML: `${top_10_score.attributes.attempts}`
            }, score_row);

            domConstruct.create("td", {
              className: `field-right`,
              innerHTML: `${top_10_score.attributes.correct}`
            }, score_row);

            domConstruct.create("td", {
              className: `field-right`,
              innerHTML: `${top_10_score.attributes.wrong}`
            }, score_row);

            domConstruct.create("td", {
              className: `field-right`,
              innerHTML: `${new Date(top_10_score.attributes.playedon).toLocaleDateString()}`
            }, score_row);

          });
        };

        // SCOREBOARD LINK //
        const top10_scores_list = dom.byId("top10-scores-list");
        const user_scores_list = dom.byId("user-scores-list");
        on(scoreboard_link, "click", () => {
          flags_game.getScores(false).then(top_10_scores => {
            displayScores(top_10_scores, top10_scores_list);
          });
          if(flags_game.user != null) {
            flags_game.getScores(true).then(top_user_scores => {
              displayScores(top_user_scores, user_scores_list);
            });
          }
          calcite.bus.emit("modal:open", { id: "game-scores-dialog" });
        });

        // SIGNED IN USER //
        this.on("portal-user-change", () => {
          flags_game.user = this.base.portal.user;
          domClass.toggle("user-scores-tab-title", "hide", (flags_game.user == null));
        });
        domClass.toggle("user-scores-tab-title", "hide", (flags_game.user == null));

        // GAME STATUS //
        flags_game.watch("status", status => {
          switch (status) {
            case flags_game.STATUS.LOST:
              domClass.add(flags_panel, "panel-disabled");
              dom.byId("info-message").innerHTML = "You lost this game.  Better luck next time...";
              calcite.bus.emit("modal:open", { id: "info-dialog" });
              break;
            case flags_game.STATUS.WON:
              domClass.add(flags_panel, "panel-disabled");
              dom.byId("info-message").innerHTML = "You WON!!!!";
              calcite.bus.emit("modal:open", { id: "info-dialog" });
              break;
          }
        });

        // RESET GAME //
        const resetGame = () => {
          domConstruct.empty(flags_panel);
          clearFlagGraphics();
          this.resetIdenticalFlags();
          domClass.remove(flags_panel, "panel-disabled");
          flags_game.reset();
        };
        on(dom.byId("reset-link"), "click", resetGame);


        // COUNTRY NODE CREATOR
        const countryNodeCreator = (countryInfo, hint) => {
          if(hint === "avatar") {

            const flagAvatarNode = domConstruct.create("img", {
              id: `country-flag-${countryInfo.country}`,
              className: "country-flag",
              src: `https://apl.esri.com/legends/Flags/${countryInfo.country}.jpg`
            });

            return { node: flagAvatarNode, data: countryInfo, type: ["country-info"] };

          } else {

            const countryNode = domConstruct.create("div", {
              id: `country-node-${countryInfo.country}`,
              "data-country": countryInfo.country,
              "data-rank": countryInfo.rank,
              className: "country-panel panel panel-light-blue panel-no-border"
            });

            const flagNode = domConstruct.create("img", {
              id: `country-flag-${countryInfo.country}`,
              className: "country-flag",
              src: `https://apl.esri.com/legends/Flags/${countryInfo.country}.jpg`
            }, countryNode);
            on(flagNode, "contextmenu", evt => {
              evt.preventDefault();
              evt.stopPropagation();
              return false;
            });

            const rankNode = domConstruct.create("span", {
              id: `country-rank-${countryInfo.country}`,
              className: "country-rank",
              innerHTML: countryInfo.rank
            }, countryNode);

            const nameNode = domConstruct.create("div", {
              id: `country-name-${countryInfo.country}`,
              className: "country-name animate-in-up hide",
              innerHTML: countryInfo.country
            }, countryNode);

            return { node: countryNode, data: countryInfo, type: ["country-info"] };
          }

        };

        // DRAG-N-DROP //
        const dragSource = new Source(flags_panel, { "creator": countryNodeCreator, copyOnly: true, selfAccept: false });
        const dragTarget = new Target(view.container, { accept: ["country-info"] });

        // DISPLAY NEXT COUNTRY //
        flags_game.on("next-country", countryInfo => {
          dragSource.insertNodes(false, [countryInfo]);
        });

        // WHEN THE GAME IS READY TO START //
        watchUtils.init(flags_game, "ready", ready => {

          // RESET //
          domClass.toggle("reset-link", "btn-disabled", !ready);

          if(ready) {

            // SETS OF COUNTRIES WITH IDENTICAL FLAGS //
            let identical_flags = null;
            this.resetIdenticalFlags = () => {
              identical_flags = {
                "indonesia": ["indonesia", "monaco"],
                "monaco": ["indonesia", "monaco"],
                "romania": ["romania", "chad"],
                "chad": ["romania", "chad"],
              };
            };
            this.resetIdenticalFlags();

            // IS CORRECT COUNTRY //
            const isCorrectCountry = (rank, drag_cntry, drop_cntry) => {
              const drag_country = drag_cntry.toLowerCase();
              const drop_country = drop_cntry.toLowerCase();

              const identical_drag = identical_flags[drag_country];
              if(identical_drag) {
                const is_correct = identical_drag.includes(drop_country);
                if(is_correct) {
                  identical_drag.splice(identical_drag.indexOf(drop_country), 1);
                  const identical_drop = identical_flags[drop_country];
                  identical_drop.splice(identical_drop.indexOf(drop_country), 1);
                  if(drag_country !== drop_country) {
                    const dropNameNode = dom.byId(`country-name-${drop_cntry}`);
                    if(dropNameNode) {
                      dropNameNode.innerHTML = drag_cntry;
                    } else {
                      flags_game.switchCountryNames(rank, drag_cntry, drop_cntry);
                    }
                  }
                }
                return is_correct;
              } else {
                return (drag_country === drop_country);
              }
            };

            let move_handle = null;
            let move_offsetX = null;
            let move_offsetY = null;
            let highlight_handle = null;

            aspect.after(dragTarget, "onDraggingOver", () => {
              this.clearHighlight();
              move_handle = aspect.after(dragTarget, "onMouseMove", (move_evt) => {
                move_offsetX = move_evt.offsetX;
                move_offsetY = move_evt.offsetY;
                highlight_handle && (!highlight_handle.isFulfilled()) && highlight_handle.cancel();
                highlight_handle = highlightCountry({ x: move_offsetX, y: move_offsetY });
              }, true);
            }, true);
            aspect.after(dragTarget, "onDraggingOut", () => {
              move_handle && move_handle.remove();
            }, true);
            aspect.after(dragTarget, "onDrop", (source, nodes, copy) => {
              move_handle && move_handle.remove();

              query(".country-panel", view.container).forEach(domConstruct.destroy);
              this.clearHighlight();
              domClass.add(flags_panel, "panel-disabled");

              const drag_country = source.anchor.dataset.country;
              const drag_rank = Number(source.anchor.dataset.rank);

              const dragCountryNode = dom.byId(`country-node-${drag_country}`);
              const dragRankNode = dom.byId(`country-rank-${drag_country}`);
              const dragNameNode = dom.byId(`country-name-${drag_country}`);

              countries_layer.queryFeatures({
                geometry: view.toMap({ x: move_offsetX, y: move_offsetY }),
                outFields: ["*"],
                returnGeometry: true
              }).then(featureSet => {

                this.clearHighlight();

                if(featureSet.features.length) {
                  const drop_country_feature = featureSet.features[0];
                  const drop_country = drop_country_feature.attributes.Country;

                  if(isCorrectCountry(drag_rank, drag_country, drop_country)) {

                    flags_game.addAttempt(true, drag_rank);
                    domConstruct.destroy(dragCountryNode);

                    createFlagGraphic(drop_country_feature.geometry, drop_country);
                    this.clearHighlight();
                    domClass.remove(flags_panel, "panel-disabled");

                  } else {
                    const attempt = flags_game.addAttempt(false, drag_rank);
                    dragRankNode.innerHTML = attempt.points;

                    domClass.toggle(dragNameNode, "hide", !attempt.hint);
                    domClass.add(dragCountryNode, "country-attempt-wrong");
                    domClass.toggle(flags_panel, "panel-disabled", attempt.gameOver);

                  }
                } else {
                  domClass.remove(flags_panel, "panel-disabled");
                }
              });

            }, true);

          }
        });
      });

    }

  });
});