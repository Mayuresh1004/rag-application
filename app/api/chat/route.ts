// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import OpenAI from "openai";
import "dotenv/config";

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    // 1. Setup embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY!,
      model: "text-embedding-004",
    });

    // 2. Connect to Qdrant
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: "http://localhost:6333",
        collectionName: "rag_collection",
      }
    );

    // 3. Retrieve top-k docs
    const retriever = vectorStore.asRetriever();    

    
    const relevantChunks = await retriever.invoke(query);

    // 4. Create system prompt
    const SYSTEM_PROMPT = `
    You are an AI Assistant who helps resolving user queries based on the context available to you from raw text, uploaded documents or given website url with the content and page number.

    Only answer based on the available context from file only.      
    Format output in **Markdown** (use lists, bold/italics, and code blocks when relevant).
    In The end always add a reference to the source(s) of the answer.
    for source reference dont give entire filepath just give the filename for file and link for website
    If context does not contain the answer, say "I do not currently have the available context for this question."
      
      CONTEXT: ${JSON.stringify(relevantChunks)}
    `;

    // 5. Call Gemini chat with streaming
    const stream = await openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              // Must end with two newlines for SSE
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: "Error streaming response" })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });
    
    
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
