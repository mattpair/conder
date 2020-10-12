import { GluegunToolbox } from 'gluegun';
import {ApisauceInstance } from 'apisauce'

export function getClient(toolbox: GluegunToolbox): ApisauceInstance {
    return toolbox.http.create({baseURL: toolbox.config.gateway_location})
} 