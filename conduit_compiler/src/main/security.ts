
import * as crypto from 'crypto'

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateRandomPassword(): string {
    const password: string[] = []
        
    crypto.randomBytes(512).forEach((b) => password.push(charset[b % charset.length]))
    return password.join("")
}