// import { MediumState } from "../provisioner";
// import {SecretManagerServiceClient} from '@google-cloud/secret-manager'


// export interface MediumController {
//     tryGet(mediumName: string): Promise<undefined| MediumState>
//     get(mediumName: string): Promise<MediumState>
//     save(mediumName: string, state: MediumState): Promise<void>
//     delete(mediumName: string, deleteAction: (m: MediumState) => Promise<void>): Promise<void>
// }

// export class GCPMediumController implements MediumController {
//     private readonly client = new SecretManagerServiceClient()
//     private static readonly SECRET_PREFIX = `projects/630690829335/secrets/`


//     async tryGet(mediumName: string) {
//         return this.client.accessSecretVersion({name: `${GCPMediumController.SECRET_PREFIX}${mediumName}/versions/1`}).then((r) => {
//             if (r[0].payload && r[0].payload.data) {
//                 //@ts-ignore
//                 const stringPayload  = r[0].payload.data.toString("utf8")
                
//                 return JSON.parse(stringPayload)    
//             }
//             return undefined
//         }).catch(console.error)
        
//     }

//     get(mediumName: string): Promise<MediumState> {
//         return this.tryGet(mediumName).then(maybeState => {
//             if (!maybeState) {
//                 return Promise.reject(`Unable to locate state for medium ${mediumName}`)
//             }

//             return maybeState
//         })
//     }

//     save(mediumName: string, state: MediumState) {
//         return this.client.createSecret(
//             {
//                 parent: "projects/conder-systems-281115",
//                 secret: {
//                     name: mediumName,
//                     replication: {
//                         automatic: {}
//                     },
                         
//                 },
//                 secretId: mediumName,
//             }
//         ).then(s => {
//             return this.client.addSecretVersion({
//                 parent: s[0].name,
//                 payload: {
//                     data: Buffer.from(JSON.stringify(state), 'utf-8')
//                 }
//             }).then(() => {})
//         }).catch(console.error)
//     }

//     delete(mediumName: string, deleteAction: (m: MediumState) => Promise<void>) {
//         return this.get(mediumName).then(result => {
//             return deleteAction(result)
//             .then(() => this.client.deleteSecret({name: `${GCPMediumController.SECRET_PREFIX}${mediumName}`}).then(_ => undefined))
//         })
//     }
// }
