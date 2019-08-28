/**
 *
 * CountryFlagsGame
 *  - A game to match country flags with the corresponding country on a map
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  1/31/2019 - 0.0.1 -
 * Modified:
 *
 */
define([
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/portal/PortalUser",
  "esri/layers/Layer",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct"
], function (Accessor, Evented, watchUtils, PortalUser, Layer, dom, domClass, domConstruct) {

  const CountryFlagsGame = Accessor.createSubclass([Evented], {

    declaredClass: "CountryFlagsGame",

    STATUS: {
      STARTED: 1,
      WON: 2,
      LOST: 3
    },

    _points: {
      min: 1,
      max: 6,
      penalty: {
        1: -3,
        2: -2,
        3: -2,
        4: -1,
        5: -1,
        6: -1
      }
    },

    properties: {
      ready: {
        type: Boolean
      },
      container: {
        type: HTMLDivElement | String,
        set: function (value) {
          this._set("container", (value instanceof HTMLDivElement) ? value : dom.byId(value));
        }
      },
      user: {
        type: PortalUser,
        set: function (value) {
          this._set("user", value);
          this.notifyChange("canSave");
        }
      },
      source: {
        type: Object,
        dependsOn: ["container"],
        set: function (value) {
          this._set("source", value);
          if(this.source != null) {
            this.initializeSource().then(() => {
              this.initializeUI();
              this.initializeScores();
            });
          }
        }
      },
      themeFields: {
        type: Array
      },
      theme: {
        type: String
      },
      playedOn: {
        type: Date
      },
      status: {
        type: Number
      },
      attempts: {
        type: Number
      },
      correct: {
        type: Number
      },
      wrong: {
        type: Number,
        set: function (value) {
          this._set("wrong", value);
          if(this.wrong >= this.maxWrong) {
            this.status = this.STATUS.LOST;
          }
        }
      },
      maxWrong: {
        type: Number,
        readOnly: true,
        value: 10
      },
      countryFeatures: {
        type: Array
      },
      maxAttempts: {
        type: Number,
        aliasOf: "countryFeatures.length"
      },
      hints: {
        type: Number
      },
      countriesByRank: {
        type: Map
      },
      current_rank: {
        type: Number
      },
      current_countries: {
        type: Array
      },
      score: {
        type: Number,
        set: function (value) {
          this._set("score", value);
          this.notifyChange("isTop10");
        }
      },
      top_10_scores: {
        type: Array,
        dependsOn: ["score"],
        set: function (value) {
          this._set("top_10_scores", value);
          this.notifyChange("isTop10");
        }
      },
      isTop10: {
        type: Boolean,
        dependsOn: ["top_10_scores"],
        get: function () {
          if(this.top_10_scores) {
            const tenth_score = this.top_10_scores[this.top_10_scores.length - 1].attributes.score;
            return (this.score > 0) && (this.score >= tenth_score);
            //return (this.score > 0) && ((this.score >= tenth_score) || (this.top_10_scores.length < 10));
          } else {
            return false;
          }
        }
      },
      canSave: {
        type: Boolean,
        dependsOn: ["user", "score"],
        get: function () {
          return (this.user != null) && (this.score > 0);
        }
      }
    },

    /**
     *
     */
    constructor: function () {
      this.ready = false;
      this._reset();
    },

    /**
     *
     */
    initializeSource: function () {

      // GET COUNTRY FEATURES //
      const country_query = this.source.createQuery();
      country_query.outFields = ["*"]; // [this.source.objectIdField, "Country", "Rank"];
      return this.source.queryFeatures(country_query).then(country_featureSet => {

        // COUNTRY FEATURES //
        this.countryFeatures = country_featureSet.features;

        // THEME FIELDS //
        this.themeFields = country_featureSet.fields.filter(field => {
          return field.name.startsWith("rank_");
        });

        // INITIAL THEME //
        this.theme = this.themeFields[0].name;

        // ORGANIZE COUNTRIES BY THEME AND RANK //
        this.countriesByThemeAndRank();

        this.ready = true;
      });
    },

    /**
     *
     */
    countriesByThemeAndRank: function () {

      // ORGANIZE COUNTRIES BY THEME AND RANK //
      this.countriesByTheme = this.countryFeatures.reduce((countriesByTheme, feature, feautureIdx) => {
        const country = feature.attributes.Country;

        this.themeFields.forEach(themeField => {

          let countriesByRank = countriesByTheme.get(themeField.name);
          if(!countriesByRank) {
            countriesByRank = new Map();
            countriesByTheme.set(themeField.name, countriesByRank);
          }

          const rank = feature.attributes[themeField.name];
          const rank_list = countriesByRank.get(rank);
          if(!rank_list) {
            countriesByRank.set(rank, [country]);
          } else {
            countriesByRank.set(rank, rank_list.concat(country));
          }

        });

        return countriesByTheme;
      }, new Map());

      // SET CURRENT RANK //
      this.current_rank = this._points.min;

      // INITIAL COUNTRIES //
      this.setInitialCountries();

    },

    /**
     *
     */
    /* initializeCountriesByRank: function () {

       // ORGANIZE COUNTRIES BY RANK //
       this.countriesByRank = this.countryFeatures.reduce((info, feature) => {
         const rank = feature.attributes.Rank;
         const country = feature.attributes.Country;
         const rank_list = info.get(rank);
         if(!rank_list) {
           info.set(rank, [country]);
         } else {
           info.set(rank, rank_list.concat(country));
         }
         return info;
       }, new Map());

       // SET CURRENT RANK //
       this.current_rank = this._points.min;

     },*/

    /**
     *
     */
    setInitialCountries: function () {

      const previous_countries = this.current_countries ? [...this.current_countries] : [];
      this.current_countries = [];

      let count = 0;
      while (count < this.maxWrong) {
        const next_country = this.peekNextCountry();
        if(!previous_countries.includes(next_country.country)) {
          count++;

          this.removeCountry(next_country);
          this.current_countries.push(next_country.country);
          this.emit("next-country", next_country);

        }
      }

      /*for (let index = 0; index < this.maxWrong; index++) {
        const next_country = this.getNextCountry();
        this.current_countries.push(next_country);
        this.emit("next-country", next_country);
      }*/

    },

    /**
     *
     */
    peekNextCountry: function () {
      const rank = this.current_rank;
      const countriesByRank = this.countriesByTheme.get(this.theme);
      let countries = countriesByRank.get(rank);
      if(countries) {
        const index = Math.floor(Math.random() * countries.length);
        const country = countries[index];
        return { country: country, rank: rank, index: index };
      } else {
        this.status = this.STATUS.WON;
        return null;
      }
    },

    /**
     *
     * @param countryInfo
     */
    removeCountry: function (countryInfo) {
      const countriesByRank = this.countriesByTheme.get(this.theme);
      let countries = countriesByRank.get(countryInfo.rank);
      if(countries) {
        countries.splice(countryInfo.index, 1);
        if(countries.length > 0) {
          countriesByRank.set(countryInfo.rank, countries);
        } else {
          countriesByRank.delete(countryInfo.rank);
          this.current_rank++;
        }
        this.countriesByTheme.set(this.theme, countriesByRank);
      } else {
        this.status = this.STATUS.WON;
        return null;
      }
    },

    /**
     *
     * @returns {*}
     */
    getNextCountry: function () {
      const countryInfo = this.peekNextCountry();
      this.removeCountry(countryInfo);
      return countryInfo;
    },

    /**
     *
     * @param rank
     * @param drag_country
     * @param drop_country
     */
    switchCountryNames: function (rank, drag_country, drop_country) {
      const countriesByRank = this.countriesByTheme.get(this.theme);
      let countries = countriesByRank.get(rank);
      const index = countries.indexOf(drop_country);
      countries.splice(index, 1, drag_country);
      countriesByRank.set(rank, countries);
      this.countriesByTheme.set(this.theme, countriesByRank);
    },

    /**
     *
     */
    initializeUI: function () {

      // ATTEMPTS //
      const attempts_panel = domConstruct.create("div", { className: "panel panel-dark-blue trailer-quarter" }, this.container);
      domConstruct.create("div", { className: "font-size-0", innerHTML: "attempts" }, attempts_panel);
      const attempts_node = domConstruct.create("div", { className: "font-size-4 text-center", innerHTML: "0 of 0" }, attempts_panel);
      watchUtils.init(this, "attempts", attempts => {
        attempts_node.innerHTML = `${attempts}&nbsp;&nbsp;of&nbsp;&nbsp;${this.maxAttempts}`;
      });

      // DETAILS //
      const details_panel = domConstruct.create("div", { className: "details-panel panel panel-dark-blue panel-no-padding trailer-quarter" }, this.container);

      // CORRECT //
      const correct_panel = domConstruct.create("div", { className: "detail-panel panel panel-dark-blue panel-no-border" }, details_panel);
      domConstruct.create("div", { className: "text-center font-size-0", innerHTML: "correct" }, correct_panel);
      const correct_node = domConstruct.create("div", { className: "text-center font-size-4", innerHTML: "0" }, correct_panel);
      watchUtils.init(this, "correct", correct => {
        correct_node.innerHTML = correct;
      });

      // WRONG //
      const wrong_panel = domConstruct.create("div", { className: "detail-panel panel panel-dark-blue panel-no-border" }, details_panel);
      domConstruct.create("div", { className: "text-center font-size-0", innerHTML: "wrong" }, wrong_panel);
      const wrong_node = domConstruct.create("div", { className: "text-center font-size-4", innerHTML: "0" }, wrong_panel);
      watchUtils.init(this, "wrong", wrong => {
        wrong_node.innerHTML = wrong;
      });

      // HINTS //
      const hints_panel = domConstruct.create("div", { className: "detail-panel panel panel-dark-blue panel-no-border" }, details_panel);
      const hints_label = domConstruct.create("div", { className: "text-center font-size-0", innerHTML: "hints" }, hints_panel);
      // domConstruct.create("span", { className: "esri-icon-lightbulb" }, hints_label);
      const hints_node = domConstruct.create("div", { className: "text-center font-size-4", innerHTML: "0" }, hints_panel);
      watchUtils.init(this, "hints", hints => {
        hints_node.innerHTML = hints;
      });

      // SCORE //
      const score_panel = domConstruct.create("div", { className: "panel panel-dark-blue trailer-quarter" }, this.container);
      domConstruct.create("div", { className: "font-size-0", innerHTML: "score" }, score_panel);
      const score_node = domConstruct.create("div", { className: "text-center font-size-7", innerHTML: "0" }, score_panel);
      watchUtils.init(this, "score", score => {
        score_node.innerHTML = score;
      });

      // TOP 10 //
      const top_10_label = domConstruct.create("span", { className: "avenir-italic icon-ui-favorites icon-ui-yellow right hide", innerHTML: "Top 10" }, score_panel);
      this.watch("isTop10", isTop10 => {
        domClass.toggle(top_10_label, "hide", !isTop10);
      });

    },

    /**
     *
     * @param is_correct
     * @param rank
     */
    addAttempt: function (is_correct, rank) {

      // ATTEMPTS //
      this.attempts++;

      // HAS HINTS //
      const hasHints = (this.hints > 0);

      // CORRECT 0R WRONG //
      if(is_correct) {
        this.correct++;
        this.emit("next-country", this.getNextCountry());
      } else {
        this.wrong++;
        if(hasHints) this.hints--;
      }

      // SCORE CHANGE //
      const score_change = is_correct ? rank : this._points.penalty[rank];

      // UPDATE SCORE //
      this.score += score_change;

      // RETURN SCORE CHANGE //
      return { points: score_change, hint: hasHints, gameOver: (this.wrong >= this.maxWrong) };
    },

    /**
     *
     */
    reset: function () {
      // COUNTRIES BY RANK //
      this.countriesByThemeAndRank();
      // RESET //
      this._reset();
    },

    /**
     *
     * @private
     */
    _reset: function () {
      this.status = this.STATUS.STARTED;
      this.playedOn = new Date();

      this.attempts = 0;
      this.correct = 0;
      this.wrong = 0;
      this.score = 0;
      this.hints = 3;

      this.isTop10 = false;
      this.canSave = false;
    },

    /**
     *  NOTE: SLIGHT ATTRIBUTE NAME DIFFERENCES BASED ON SERVICE FIELD NAMES...
     */
    asGameAttributes: function () {
      return {
        // Creator: this.user ? this.user.username : "not-signed-in",
        // CreationDate: this.playedOn.valueOf(),
        username: this.user ? this.user.username : "not-signed-in",
        fullname: this.user ? this.user.fullName : "not-signed-in",
        playedon: this.playedOn.valueOf(),
        theme: this.themeFields.find(field => {
          return (field.name === this.theme);
        }).alias || "uknonwn",
        attempts: this.attempts,
        correct: this.correct,
        wrong: this.wrong,
        score: this.score
      }
    },

    /**
     *
     */
    initializeScores: function () {

      Layer.fromPortalItem({ portalItem: { id: "1fa196d1b5354951bc462b49d3322d8d" } }).then(scores_layer => {

        const attribute_types = {
          CreationDate: "number",
          Creator: "string",
          EditDate: "number",
          Editor: "string",
          OBJECTID: "number",
          attempts: "number",
          correct: "number",
          fullname: "string",
          playedon: "number",
          score: "number",
          theme: "string",
          username: "string",
          wrong: "number"
        };

        const validate_score = (top_10_score) => {
          return Object.keys(top_10_score.attributes).every(att => {
            return (typeof top_10_score.attributes[att]) === attribute_types[att];
          });
        };


        this.getScores = (user_scores_only) => {
          const scores_query = scores_layer.createQuery();
          scores_query.orderByFields = ["score DESC", "playedon DESC"];
          scores_query.num = 10;
          scores_query.where = (user_scores_only && (this.user != null)) ? `(username = '${this.user.username}') AND (score < 922)` : "(score < 922)";
          return scores_layer.queryFeatures(scores_query).then(scores_featureSet => {
            const top_scores = scores_featureSet.features;
            if(top_scores.length > 10) {
              console.warn("Retrieved more than 10 scores....");
            }

            const valid_scores = top_scores.filter(validate_score);
            if(valid_scores.length !== top_scores.length) {
              console.warn("Found Invalid Scores: ", top_scores, valid_scores);
            }

            return user_scores_only ? valid_scores : valid_scores.slice(0, 10);
          });
        };

        this.getScores().then(top_scores => {
          this.top_10_scores = top_scores;
          this.emit("scoreboard-ready", {});
        });

        this.save = () => {
          const game_atts = this.asGameAttributes();
          return scores_layer.applyEdits({ addFeatures: [{ attributes: game_atts }] });
        };

      });

    }

  });

  CountryFlagsGame.version = "0.0.1";

  return CountryFlagsGame;
});