// Allow native build scripts for required packages
function readPackage(pkg) {
  return pkg
}

module.exports = { hooks: { readPackage } }
