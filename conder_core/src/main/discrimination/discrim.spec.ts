import { schemaFactory } from './../ops/SchemaFactory';
import { ObjectsOnlyDiscriminator } from './object_discrim';

describe("discriminating between types", () => {

    it("can only discriminate between objects", () => {
        const d = ObjectsOnlyDiscriminator.for(schemaFactory.Union([
            schemaFactory.int,
            schemaFactory.string,
        ]))
        expect(d).toEqual("contains non-objects")
    })
})