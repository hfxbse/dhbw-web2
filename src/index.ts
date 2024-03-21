import {createInterface} from "readline";
import {stdin, stdout} from "process";
import {login} from "./instagram.js";


async function authenticate() {
    const prompt = createInterface({
        input: stdin,
        output: stdout
    })

    function ask(question: string): Promise<string> {
        return new Promise((resolve) => prompt.question(question, resolve))
    }

    while (true) {
        try {
            const user = await ask("Instagram username, phone number, or email: ")
            const password = await ask("Password: ")

            return await login({user, password})
        } catch (e) {
            console.error((e as Error).message)
        }
    }
}

const sessionId = await authenticate()
console.dir({sessionId})
