import gulp from 'gulp'
import mocha from 'gulp-mocha'
import runSequence from 'run-sequence'

gulp.task('end', () => {
  process.exit()
})

gulp.task('_test', () => {
  return gulp.src('src/test/randomized_basic_runner.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha({reporter: 'nyan'}))
})

gulp.task('test', (done) => runSequence('_test', 'end', done))
