


//Associated with the eponym in the storage module.
export type Suppression = {
    suppress: {
    [p in string]?: Suppression
    }
}

export const ADDRESS = "__conduit_entity_id"