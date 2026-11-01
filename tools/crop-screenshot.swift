#!/usr/bin/env swift

import AppKit
import Foundation

guard CommandLine.arguments.count == 4,
      let topInset = Int(CommandLine.arguments[3]),
      topInset >= 0 else {
    fputs("Kullanım: crop-screenshot.swift <girdi.png> <çıktı.png> <üst-piksel>\n", stderr)
    exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

guard let source = NSImage(contentsOf: inputURL),
      let sourceCG = source.cgImage(forProposedRect: nil, context: nil, hints: nil),
      topInset < sourceCG.height else {
    fputs("Girdi PNG okunamadı veya kırpma yüksekliği geçersiz.\n", stderr)
    exit(3)
}

// CGImage kırpma koordinatları görüntünün sol üstünden başlar.
let cropRect = CGRect(
    x: 0,
    y: topInset,
    width: sourceCG.width,
    height: sourceCG.height - topInset
)

guard let cropped = sourceCG.cropping(to: cropRect) else {
    fputs("Görüntü kırpılamadı.\n", stderr)
    exit(4)
}

let representation = NSBitmapImageRep(cgImage: cropped)
guard let png = representation.representation(using: .png, properties: [:]) else {
    fputs("PNG üretilemedi.\n", stderr)
    exit(5)
}

try png.write(to: outputURL, options: .atomic)
