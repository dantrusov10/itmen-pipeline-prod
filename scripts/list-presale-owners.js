"use strict";
const { listAll } = require("../src/pb-client");
listAll("list_items", { filter: 'list_key="presale_owners"', sort: "sort_order" })
  .then(r => console.log(r.map(x => x.value).join("\n")))
  .catch(console.error);
