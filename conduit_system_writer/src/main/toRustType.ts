import { CompiledTypes } from 'conduit_parser';
export function toRustType(p: CompiledTypes.ReturnType): string {
    switch (p.kind) {
        case "VoidReturnType":
            return "()";
        case "CustomType":
            return p.modification === "array" ? `Vec<${p.type}>` : `${p.type}`;
        case "Primitive":
            throw Error(`Currently don't support primitive in or out`);
    }

}
