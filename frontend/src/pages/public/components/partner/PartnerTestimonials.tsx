import { Star, Quote } from "lucide-react"
import { TESTIMONIALS } from "./partner-data"

export function PartnerTestimonials() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Header */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-orange-500">
            Họ đã nói gì
          </p>
          <h2 className="text-3xl font-black text-slate-900 md:text-4xl">
            Chủ sân tin tưởng RCField
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
            Hơn 50 RC Cafe tại Việt Nam đang vận hành cùng chúng tôi.
          </p>
        </div>

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.authorName}
              className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-6 shadow-sm"
            >
              {/* Quote icon */}
              <Quote className="mb-4 size-6 text-orange-400" />

              {/* Quote text */}
              <p className="flex-1 text-sm italic leading-7 text-slate-600">"{t.quote}"</p>

              {/* Stars */}
              <div className="mt-5 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`size-3.5 ${i < t.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                  />
                ))}
              </div>

              {/* Author */}
              <div className="mt-3 border-t border-slate-100 pt-4">
                <p className="text-sm font-black text-slate-900">{t.authorName}</p>
                <p className="text-xs text-slate-500">
                  {t.cafeName} · {t.city}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
