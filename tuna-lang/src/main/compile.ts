import { ParseResult, globals_$0_$0, ASTKinds, func } from "./parser";


type GlobalObject = {kind: "glob", name: string}

type ValidGlobal = GlobalObject | func

export function compile(p: ParseResult): ValidGlobal[] {
    if (p.err) {
        throw Error(`Failure parsing: line ${p.err.pos.line} col ${p.err.pos.offset}`)
    }
    return p.ast.map(g => {
        switch (g.value.kind) {
            case ASTKinds.varDecl: 
                if (g.value.mutability !== "const") {
                    throw Error(`Global variable ${g.value.name.name} must be const`)
                }
                switch (g.value.value.root.kind) {
                    case ASTKinds.obj: 
                        if (g.value.value.methods.length > 0) {
                            break
                        }
                        return {kind: "glob", name: g.value.name.name}
                    default: 
                        break
                }

                throw Error(`Global ${g.value.name.name} must be initialized as empty objects`)
                
            case ASTKinds.func: 

                return g.value

            default: 
                const ne: never = g.value
        }
    })

}