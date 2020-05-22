import { FileType, DirKind } from './../../main/filesys/crawl';
import { strToFileLocation } from "../../main/filesys/crawl"

test("simple file location", () => {
    expect(strToFileLocation("abc.cdt")).toEqual({
        filename: "abc",
        type: FileType.Conduit,
        instrs: []
    })
    
})

test("parent file location", () => {
    expect(strToFileLocation("../abc.cdt")).toEqual({
        filename: "abc",
        type: FileType.Conduit,
        instrs: [{kind: DirKind.UP}]
    })  
})

test("subdir file location", () => {
    expect(strToFileLocation("nested/abc.cdt")).toEqual({
        filename: "abc",
        type: FileType.Conduit,
        instrs: [{kind: DirKind.SUBDIR, val: "nested"}]
    })  
})