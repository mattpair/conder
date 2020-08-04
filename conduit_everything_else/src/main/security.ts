
import * as crypto from 'crypto'

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateRandomPassword(length: number=512): string {
    const password: string[] = []
        
    crypto.randomBytes(length).forEach((b) => password.push(charset[b % charset.length]))
    return password.join("")
}