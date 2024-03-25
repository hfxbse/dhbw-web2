import * as prompt from '@inquirer/prompts';
import {encryptPassword, fetchVerification, login} from "./instagram";
import {ExitPromptError} from "@inquirer/prompts";


async function authenticate() {
    const verification = await fetchVerification()

    while (true) {
        const user = await prompt.input({message: "Instagram username, phone number, or email: "})
        const password = await prompt.password({message: "Password: "})

        const encryptedPassword = await encryptPassword({password, key: verification.key})

        try {
            return await login({user, password: encryptedPassword, verification})
        } catch (e) {
            console.error((e as Error).message)
        }
    }
}

try {
    console.dir({sessionId: await authenticate()})
} catch (e) {
    if (!(e instanceof ExitPromptError)) {
        console.error(e)
    }
}
