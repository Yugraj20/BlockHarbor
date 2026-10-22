using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class Program
{
    static Bitmap DrawIcon(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.Clear(Color.Transparent);

        float s = size / 48f;

        // Top face (#34d399)
        var topPoints = new PointF[]
        {
            new PointF(24f * s, 4f * s),
            new PointF(42f * s, 14.5f * s),
            new PointF(24f * s, 25f * s),
            new PointF(6f * s, 14.5f * s)
        };
        using var topBrush = new SolidBrush(Color.FromArgb(255, 52, 211, 153));
        g.FillPolygon(topBrush, topPoints);

        // Left face (#059669)
        var leftPoints = new PointF[]
        {
            new PointF(6f * s, 14.5f * s),
            new PointF(24f * s, 25f * s),
            new PointF(24f * s, 44f * s),
            new PointF(6f * s, 33.5f * s)
        };
        using var leftBrush = new SolidBrush(Color.FromArgb(255, 5, 150, 105));
        g.FillPolygon(leftBrush, leftPoints);

        // Right face (#047857)
        var rightPoints = new PointF[]
        {
            new PointF(24f * s, 25f * s),
            new PointF(42f * s, 14.5f * s),
            new PointF(42f * s, 33.5f * s),
            new PointF(24f * s, 44f * s)
        };
        using var rightBrush = new SolidBrush(Color.FromArgb(255, 4, 120, 87));
        g.FillPolygon(rightBrush, rightPoints);

        // Top Inner Inset (#6ee7b7)
        var innerTopPoints = new PointF[]
        {
            new PointF(24f * s, 7.5f * s),
            new PointF(37.5f * s, 15f * s),
            new PointF(24f * s, 22.5f * s),
            new PointF(10.5f * s, 15f * s)
        };
        using var innerTopBrush = new SolidBrush(Color.FromArgb(255, 110, 231, 183));
        g.FillPolygon(innerTopBrush, innerTopPoints);

        // Beacon Diamond (White)
        var beaconPoints = new PointF[]
        {
            new PointF(24f * s, 16f * s),
            new PointF(28f * s, 21f * s),
            new PointF(24f * s, 26f * s),
            new PointF(20f * s, 21f * s)
        };
        using var whiteBrush = new SolidBrush(Color.White);
        g.FillPolygon(whiteBrush, beaconPoints);

        // Beacon Core (#10b981)
        var corePoints = new PointF[]
        {
            new PointF(24f * s, 18.5f * s),
            new PointF(26f * s, 21f * s),
            new PointF(24f * s, 23.5f * s),
            new PointF(22f * s, 21f * s)
        };
        using var coreBrush = new SolidBrush(Color.FromArgb(255, 16, 185, 129));
        g.FillPolygon(coreBrush, corePoints);

        return bmp;
    }

    static void SaveIco(Bitmap[] bitmaps, string outputPath)
    {
        using var fs = File.Create(outputPath);
        using var bw = new BinaryWriter(fs);

        bw.Write((ushort)0); // Reserved
        bw.Write((ushort)1); // ICO type
        bw.Write((ushort)bitmaps.Length);

        int offset = 6 + (16 * bitmaps.Length);
        var pngBytes = new byte[bitmaps.Length][];

        for (int i = 0; i < bitmaps.Length; i++)
        {
            using var ms = new MemoryStream();
            bitmaps[i].Save(ms, ImageFormat.Png);
            pngBytes[i] = ms.ToArray();

            byte w = (byte)(bitmaps[i].Width >= 256 ? 0 : bitmaps[i].Width);
            byte h = (byte)(bitmaps[i].Height >= 256 ? 0 : bitmaps[i].Height);

            bw.Write(w);
            bw.Write(h);
            bw.Write((byte)0); // Colors
            bw.Write((byte)0); // Reserved
            bw.Write((ushort)1); // Planes
            bw.Write((ushort)32); // Bpp
            bw.Write((uint)pngBytes[i].Length);
            bw.Write((uint)offset);

            offset += pngBytes[i].Length;
        }

        for (int i = 0; i < bitmaps.Length; i++)
        {
            bw.Write(pngBytes[i]);
        }
    }

    static void Main()
    {
        var sizes = new[] { 16, 32, 48, 64, 128, 256 };
        var bitmaps = new Bitmap[sizes.Length];
        for (int i = 0; i < sizes.Length; i++)
        {
            bitmaps[i] = DrawIcon(sizes[i]);
        }

        bitmaps[sizes.Length - 1].Save("desktop/icon.png", ImageFormat.Png);
        bitmaps[sizes.Length - 1].Save("frontend/public/favicon.png", ImageFormat.Png);

        SaveIco(bitmaps, "desktop/app.ico");
        SaveIco(bitmaps, "frontend/public/favicon.ico");

        Console.WriteLine("BlockHarbor icons generated successfully!");
    }
}
