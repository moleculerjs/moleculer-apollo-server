"use strict";

const moduleName = process.argv[2] || "simple";
process.argv.splice(2, 1);

const allowedModules = ["simple", "anotherModule"]; // Define allowed modules
if (allowedModules.includes(moduleName)) {
    require("./" + moduleName);
} else {
    console.error("Invalid module name");
    process.exit(1);
}
