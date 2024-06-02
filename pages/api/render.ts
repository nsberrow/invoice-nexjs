import { NextApiRequest, NextApiResponse } from "next"
import * as Sentry from "@sentry/nextjs";

import { getPdf } from "@/service/convert"

export const config = {
    maxDuration: 30,
  };

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        // Only allow POST requests
        if (req.method !== 'POST') return res.status(405).end()
        let ssl = process.env.VERCEL ? 'https' : 'http';
        let reqBody = req.body
        Sentry.setContext("body", reqBody);
        console.info("Request Body", reqBody)
        console.info(`Headers ${JSON.stringify(req.headers)}`)

        const pdfBuffer = await getPdf(`${ssl}://${req.headers.host}`, reqBody)

        if (!pdfBuffer) return res.status(400).send('Error: could not generate PDF')

        res.setHeader('Content-Type', 'application/pdf')

        res.status(200).end(pdfBuffer)

    } catch (err: any) {
        Sentry.captureException(err)
        if (err.message === 'Protocol error (Page.navigate): Cannot navigate to invalid URL')
            return res.status(404).end()

        console.error(err)
        res.setHeader('Content-Type', 'text/plain')
        res.status(500).send('Failed to generate invoice - recorded the exception in Sentry.')
    }
}
