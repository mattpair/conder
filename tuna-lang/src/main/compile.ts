import { ParseResult, globals_$0_$0, ASTKinds } from "./parser";


export function compile(p: ParseResult): globals_$0_$0[] {
    if (p.err) {
        throw Error(`Failure parsing: line ${p.err.pos.line} col ${p.err.pos.offset}`)
    }
    return p.ast.map(g => {
        switch (g.value.kind) {
            case ASTKinds.varDecl: 
                if (g.value.mutability !== "const") {
                    throw Error(`Global variable ${g.value.name.name} must be const`)
                }
            case ASTKinds.func: 

                return g.value

            default: 
                const ne: never = g.value
        }
    })

}