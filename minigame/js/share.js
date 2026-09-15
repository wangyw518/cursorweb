function buildShareFields(settle) {
  var score = settle && settle.score ? settle.score : 0;
  var sec = settle && typeof settle.surviveSec === 'number' ? settle.surviveSec : 0;
  var secText = sec.toFixed(1);
  return {
    title: '我在《晚一步》活了 ' + secText + ' 秒，得了 ' + score + ' 分',
    imageUrl: 'mock://late-step-share',
    query: 'from=settle&score=' + score + '&t=' + secText
  };
}

function shareSettle(settle) {
  var fields = buildShareFields(settle);
  if (typeof wx !== 'undefined' && typeof wx.shareAppMessage === 'function') {
    try {
      wx.shareAppMessage({
        title: fields.title,
        imageUrl: '',
        query: fields.query
      });
    } catch (err) {}
  }
  return fields;
}

module.exports = {
  buildShareFields: buildShareFields,
  shareSettle: shareSettle
};
