#!/usr/bin/env node
"use strict";
const { listAdminActivities } = require("../src/activities");
console.log(typeof listAdminActivities);
listAdminActivities({ limit: 1 }).then(r => console.log("ok", r.total)).catch(e => console.error(e));
