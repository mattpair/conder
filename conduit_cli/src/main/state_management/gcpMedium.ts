import { MediumState } from "../deploy/gcp/provisioner";
import {Storage, Bucket, File} from '@google-cloud/storage'


type StateAndFile = {
    file: File,
    medium: MediumState
}
export interface MediumController {
    tryGet(mediumName: string): Promise<undefined| File>
    get(mediumName: string): Promise<StateAndFile>
    save(mediumName: string, state: MediumState): Promise<void>
    delete(mediumName: string, deleteAction: (m: MediumState) => Promise<void>): Promise<void>
}

export class GCPMediumController implements MediumController {
    private readonly store: Storage
    private readonly bucket: Bucket

    constructor() {
        this.store = new Storage()
        this.bucket = this.store.bucket('conduit-state')
    }


    tryGet(mediumName: string) {
        return this.bucket.getFiles({directory: "mediums"})
        .then((bucketOutput) => {
            const files = bucketOutput[0]
            const searchName = `${mediumName}.json`
            
            return files.find(f => f.name.endsWith(searchName))
        })
    }

    get(mediumName: string): Promise<StateAndFile> {
        return this.tryGet(mediumName).then(maybeFile => {
            if (!maybeFile) {
                return Promise.reject(`Unable to locate state for medium ${mediumName}`)
            }

            return maybeFile.download()
            .then(download => ({medium: JSON.parse(download[0].toString("utf-8")), file: maybeFile}))
        })
    }

    save(mediumName: string, state: MediumState) {
        return this.bucket.file(`mediums/${mediumName}.json`)
            .save(JSON.stringify(state), {gzip: false, contentType: "application/json"})  
    }

    delete(mediumName: string, deleteAction: (m: MediumState) => Promise<void>) {
        return this.get(mediumName).then(result => {
            return deleteAction(result.medium)
            .then(() => {result.file.delete()})
        })
    }
}
