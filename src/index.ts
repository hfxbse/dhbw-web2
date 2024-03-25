import * as prompt from '@inquirer/prompts';
import {encryptPassword, fetchVerification, login} from "./instagram";


async function authenticate() {
    const verification = await fetchVerification()

    while (true) {
        try {
            const user = await prompt.input({message: "Instagram username, phone number, or email: "})
            const password = await prompt.password({message: "Password: "})

            const encryptedPassword = await encryptPassword({password, key: verification.key})

            return await login({user, password: encryptedPassword, verification})
        } catch (e) {
            console.error((e as Error).message)
        }
    }
}

const sessionId = await authenticate()
console.dir({sessionId})
