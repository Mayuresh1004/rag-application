import { NextRequest, NextResponse } from "next/server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { QdrantVectorStore } from "@langchain/qdrant";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { JSONLoader } from "langchain/document_loaders/fs/json";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { QdrantClient } from "@qdrant/js-client-rest"



import os from "os";

import fs from "fs";
import path from "path";
import "dotenv/config";

export async function POST(req: NextRequest) {
  try {


   const formData = await req.formData();
  const type = formData.get("type");
  const file = formData.get("file") as File | null;
    let docs: any[] = [];

    //Raw text input
    if (type === "text") {
      const content = formData.get("content") as string;
      docs.push({ pageContent: content, metadata: { type: "text" } });
    }
    
   if (type === "file" && file) {
    //  const file = formData.get("file") as File;
 
     if (!file) {
       return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
     }
 
     // Save to /tmp
     const bytes = await file.arrayBuffer();
     const buffer = Buffer.from(bytes);
     const tempDir = os.tmpdir();
     const filePath = path.join(tempDir, file.name);
     fs.writeFileSync(filePath, buffer);
 
     // Load PDF
     let loader;
       if (file.name.endsWith(".pdf")) loader = new PDFLoader(filePath);
       else if (file.name.endsWith(".csv")) loader = new CSVLoader(filePath);
       else if (file.name.endsWith(".docx")) loader = new DocxLoader(filePath);
       else if (file.name.endsWith(".doc")) loader = new DocxLoader(filePath,{type:"doc"});
       else if (file.name.endsWith(".json")) loader = new JSONLoader(filePath);
       else loader = new TextLoader(filePath);
       docs = await loader.load();

    fs.unlinkSync(filePath);

   }

   // Website URL input
   if (type === "website") {
  const url = formData.get("url") as string;
  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  try {
    const loader = new CheerioWebBaseLoader(url);
    docs = await loader.load();
  } catch (err) {
    console.error("❌ Website loading failed:", err);
    return NextResponse.json({ error: "Failed to load website" }, { status: 500 });
  }
}



    // Gemini embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY!,
      model: "text-embedding-004",
    });

    // Index into Qdrant
    const vectorStore = await QdrantVectorStore.fromDocuments(docs, 
        embeddings, {
      url: "http://localhost:6333",
      collectionName: "rag_collection",
    });


 



    return NextResponse.json({
      message: "File indexed successfully",

      pages: docs.length,      
    });
} catch (error: any) {
  console.error("❌ Indexing failed:", error); // 👈 this will print full error in terminal
  return NextResponse.json(
    { error: error.message || "Something went wrong" },
    { status: 500 }
  );
}
}
export const config = {
  api: {
    bodyParser: false, // disable default body parsing (we use formData instead)
    sizeLimit: '20mb', // increase limit
  },
};
