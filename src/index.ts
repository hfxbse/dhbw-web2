import * as prompt from '@inquirer/prompts';
import {login} from "./instagram";


async function authenticate() {
    while (true) {
        try {
            const user = await prompt.input({message: "Instagram username, phone number, or email: "})
            const password = await prompt.password({message: "Password: "})

            return await login({user, password})
        } catch (e) {
            console.error((e as Error).message)
        }
    }
}

const sessionId = await authenticate()
console.dir({sessionId})
