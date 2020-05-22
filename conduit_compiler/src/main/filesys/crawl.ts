import { Classified, StatelessClassification } from "../util/classifying"

type FileLocation = {
    filename: string
    type: FileType
    instrs: DirInstruction[]
}

export enum FileType {
    Conduit="cdt"
}
export enum DirKind {
    UP="Parent",
    SUBDIR="Subdir"
}

type DirInstruction = Classified<DirKind.UP> | Classified<DirKind.SUBDIR, string>

const UP = StatelessClassification(DirKind.UP)

export function strToFileLocation(s: string): FileLocation {
    let pos = 0
    const instrs: DirInstruction[] = []

    while (pos < s.length ) {
        const front = s.slice(pos)
        if (/^\.\.\//.test(front)) {
            pos += 3
            instrs.push(UP)
        } else  {
            const maybeSub = /^(?<val>\w+)\//.exec(front)
            if (maybeSub !== null && maybeSub.groups) {
                pos += maybeSub.groups.val.length + 1
                instrs.push({kind: DirKind.SUBDIR, val: maybeSub.groups.val})
            } else {
                const maybeFile = /^(?<name>\w+)\.(?<type>[a-zA-Z]{2,4})$/.exec(front)
                if (maybeFile === null || maybeFile.groups === undefined) {
                    break
                }
                return {
                    instrs,
                    type: FileType.Conduit,
                    filename: maybeFile.groups.name
                }
            }


        } 

    }

    throw new Error(`Malformatted file location ${s}`)
}