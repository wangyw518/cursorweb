(function (root, factory) {
  var api = factory(
    typeof require === 'function' ? require('./cells') : root.XingchenCells
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XingchenScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cells) {
  'use strict';

  function fromCell(cell, config) {
    if (!cell) {
      return {
        points: 0,
        crystals: 0,
        score: 0,
        rarity: null,
        name: '',
        miss: true,
        oob: false,
        bonus: 0,
        cell: null
      };
    }
    var spec = cells.specOf(cell.rarity, config);
    return {
      points: spec.score,
      crystals: spec.crystals,
      score: spec.score,
      rarity: cell.rarity,
      name: spec.name,
      miss: false,
      oob: false,
      bonus: 0,
      cell: cell
    };
  }

  function combine(picks, bonus, config) {
    var score = 0;
    var crystals = 0;
    var names = [];
    var list = [];
    var i;
    for (i = 0; i < picks.length; i++) {
      var one = fromCell(picks[i], config);
      score += one.score;
      crystals += one.crystals;
      if (one.name) names.push(one.name);
      list.push(one);
    }
    var extra = bonus > 0 ? bonus : 0;
    return {
      points: score,
      crystals: crystals,
      score: score + extra,
      bonus: extra,
      rarity: list.length ? list[0].rarity : null,
      name: names.join(' · '),
      miss: picks.length === 0 && extra <= 0,
      oob: false,
      parts: list,
      cell: list.length ? list[0].cell : null
    };
  }

  function outOfBounds(bonus) {
    var extra = bonus > 0 ? bonus : 0;
    return {
      points: 0,
      crystals: 0,
      score: extra,
      bonus: extra,
      rarity: null,
      name: '',
      miss: extra <= 0,
      oob: true,
      parts: [],
      cell: null
    };
  }

  return {
    fromCell: fromCell,
    combine: combine,
    outOfBounds: outOfBounds
  };
});
