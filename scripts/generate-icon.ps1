param(
    [string]$SourcePng = "frontend/public/images/logo-full.png",
    [string]$OutputIco = "desktop/app.ico",
    [string]$OutputFavicon = "frontend/public/favicon.ico"
)

$code = @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;

public class IcoBuilder
{
    public static byte[] CreateIco(Bitmap source, int[] sizes)
    {
        using (var ms = new MemoryStream())
        using (var writer = new BinaryWriter(ms))
        {
            // ICONDIR
            writer.Write((ushort)0); // idReserved
            writer.Write((ushort)1); // idType = 1 (icon)
            writer.Write((ushort)sizes.Length); // idCount

            byte[][] payloads = new byte[sizes.Length][];
            int offset = 6 + (sizes.Length * 16);

            for (int i = 0; i < sizes.Length; i++)
            {
                int sz = sizes[i];
                using (var resized = new Bitmap(sz, sz, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(resized))
                    {
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.SmoothingMode = SmoothingMode.HighQuality;
                        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        g.Clear(Color.Transparent);
                        g.DrawImage(source, 0, 0, sz, sz);
                    }

                    using (var payloadMs = new MemoryStream())
                    using (var pWriter = new BinaryWriter(payloadMs))
                    {
                        // BITMAPINFOHEADER (40 bytes)
                        pWriter.Write((uint)40); // biSize
                        pWriter.Write((int)sz);   // biWidth
                        pWriter.Write((int)(sz * 2)); // biHeight (XOR + AND)
                        pWriter.Write((ushort)1); // biPlanes
                        pWriter.Write((ushort)32); // biBitCount
                        pWriter.Write((uint)0); // biCompression = BI_RGB
                        pWriter.Write((uint)(sz * sz * 4)); // biSizeImage
                        pWriter.Write((int)0); // biXPelsPerMeter
                        pWriter.Write((int)0); // biYPelsPerMeter
                        pWriter.Write((uint)0); // biClrUsed
                        pWriter.Write((uint)0); // biClrImportant

                        // XOR mask: 32-bit BGRA bottom-up
                        var bmpData = resized.LockBits(
                            new Rectangle(0, 0, sz, sz),
                            ImageLockMode.ReadOnly,
                            PixelFormat.Format32bppArgb
                        );
                        try
                        {
                            byte[] rowBytes = new byte[sz * 4];
                            for (int y = sz - 1; y >= 0; y--)
                            {
                                IntPtr rowPtr = IntPtr.Add(bmpData.Scan0, y * bmpData.Stride);
                                System.Runtime.InteropServices.Marshal.Copy(rowPtr, rowBytes, 0, rowBytes.Length);
                                pWriter.Write(rowBytes);
                            }
                        }
                        finally
                        {
                            resized.UnlockBits(bmpData);
                        }

                        // AND mask: 1 bit per pixel, rows padded to 4 bytes
                        int andRowSize = ((sz + 31) / 32) * 4;
                        byte[] andMask = new byte[andRowSize * sz];
                        pWriter.Write(andMask);

                        payloads[i] = payloadMs.ToArray();
                    }
                }

                // ICONDIRENTRY (16 bytes)
                writer.Write((byte)(sz >= 256 ? 0 : sz)); // bWidth
                writer.Write((byte)(sz >= 256 ? 0 : sz)); // bHeight
                writer.Write((byte)0); // bColorCount
                writer.Write((byte)0); // bReserved
                writer.Write((ushort)1); // wPlanes
                writer.Write((ushort)32); // wBitCount
                writer.Write((uint)payloads[i].Length); // dwBytesInRes
                writer.Write((uint)offset); // dwImageOffset

                offset += payloads[i].Length;
            }

            for (int i = 0; i < sizes.Length; i++)
            {
                writer.Write(payloads[i]);
            }

            return ms.ToArray();
        }
    }
}
'@

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Drawing.dll"

$srcFull = (Get-Item $SourcePng).FullName
$srcBmp = [System.Drawing.Bitmap]::FromFile($srcFull)

# Multi-resolution icon set: 256, 128, 64, 48, 32, 16
$sizes = @(256, 128, 64, 48, 32, 16)
$icoBytes = [IcoBuilder]::CreateIco($srcBmp, $sizes)

[System.IO.File]::WriteAllBytes($OutputIco, $icoBytes)
Write-Host "Created $OutputIco ($($icoBytes.Length) bytes, $($sizes.Length) resolutions)"

if ($OutputFavicon) {
    [System.IO.File]::WriteAllBytes($OutputFavicon, $icoBytes)
    Write-Host "Created $OutputFavicon"
}

$srcBmp.Dispose()
