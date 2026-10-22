using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace BlockHarbor.Desktop
{
    public static class IconGenerator
    {
        public static Bitmap DrawIcon(int size)
        {
            var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using var g = Graphics.FromImage(bmp);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);

            float s = size / 48f;

            // Top isometric face (#34d399)
            var topPoints = new PointF[]
            {
                new PointF(24f * s, 4f * s),
                new PointF(42f * s, 14.5f * s),
                new PointF(24f * s, 25f * s),
                new PointF(6f * s, 14.5f * s)
            };
            using var topBrush = new SolidBrush(Color.FromArgb(255, 52, 211, 153));
            g.FillPolygon(topBrush, topPoints);

            // Left isometric face (#059669)
            var leftPoints = new PointF[]
            {
                new PointF(6f * s, 14.5f * s),
                new PointF(24f * s, 25f * s),
                new PointF(24f * s, 44f * s),
                new PointF(6f * s, 33.5f * s)
            };
            using var leftBrush = new SolidBrush(Color.FromArgb(255, 5, 150, 105));
            g.FillPolygon(leftBrush, leftPoints);

            // Right isometric face (#047857)
            var rightPoints = new PointF[]
            {
                new PointF(24f * s, 25f * s),
                new PointF(42f * s, 14.5f * s),
                new PointF(42f * s, 33.5f * s),
                new PointF(24f * s, 44f * s)
            };
            using var rightBrush = new SolidBrush(Color.FromArgb(255, 4, 120, 87));
            g.FillPolygon(rightBrush, rightPoints);

            // Inner top inset (#6ee7b7)
            var innerTopPoints = new PointF[]
            {
                new PointF(24f * s, 7.5f * s),
                new PointF(37.5f * s, 15f * s),
                new PointF(24f * s, 22.5f * s),
                new PointF(10.5f * s, 15f * s)
            };
            using var innerTopBrush = new SolidBrush(Color.FromArgb(255, 110, 231, 183));
            g.FillPolygon(innerTopBrush, innerTopPoints);

            // Beacon diamond (White)
            var beaconPoints = new PointF[]
            {
                new PointF(24f * s, 16f * s),
                new PointF(28f * s, 21f * s),
                new PointF(24f * s, 26f * s),
                new PointF(20f * s, 21f * s)
            };
            using var whiteBrush = new SolidBrush(Color.White);
            g.FillPolygon(whiteBrush, beaconPoints);

            // Beacon core (#10b981)
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

        public static void EnsureIconsGenerated(string baseDir)
        {
            var icoPath = Path.Combine(baseDir, "app.ico");
            if (File.Exists(icoPath)) return;

            var sizes = new[] { 16, 32, 48, 64, 128, 256 };
            var bitmaps = new Bitmap[sizes.Length];
            for (int i = 0; i < sizes.Length; i++)
            {
                bitmaps[i] = DrawIcon(sizes[i]);
            }

            using var fs = File.Create(icoPath);
            using var bw = new BinaryWriter(fs);

            bw.Write((ushort)0);
            bw.Write((ushort)1);
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
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write((uint)pngBytes[i].Length);
                bw.Write((uint)offset);

                offset += pngBytes[i].Length;
            }

            for (int i = 0; i < bitmaps.Length; i++)
            {
                bw.Write(pngBytes[i]);
            }
        }
    }
}
