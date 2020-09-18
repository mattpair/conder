


//Associated with the eponym in the storage module.
export type Suppression = {
    values: {
    [p in string]?: Suppression
    }
}

export const ADDRESS = "__conduit_entity_id"