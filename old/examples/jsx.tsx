import { Component } from "app/Component.tsx";
import { create } from "parcel/ast.ts";

const vNode = create(<Component />);

const snapshotVNode = snapshot(vNode);

console.log(vNode);
