/**
 * Share card is out of scope for M0.
 */
function share() {
  // M2 will call wx.shareAppMessage / onShareAppMessage.
}

function installShareHandlers() {
  // no-op in M0
}

module.exports = {
  share,
  installShareHandlers
};
